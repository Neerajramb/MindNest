"""Object observations and last-seen answers (OBJ-01..08, FR-009..011, BR-03, NFR-009)."""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from accounts.models import User
from ai.objects import Detection, ObjectDetector
from audit.service import log_event
from care.models import Patient
from objects_ai.models import ObjectObservation, ObservationSource, Place, TrackedObject

STALE_AFTER = timedelta(hours=24)


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def _variants(name: str) -> set[str]:
    """Simple singular/plural forms so "key", "keys" and "glasses" all match."""
    variants = {name}
    if name.endswith("es"):
        variants.add(name[:-2])
    if name.endswith("s"):
        variants.add(name[:-1])
    else:
        variants.add(f"{name}s")
    return variants


def find_object(patient: Patient, text: str) -> TrackedObject | None:
    """Match a question like "where did I put my keys" to one tracked object, longest name first."""
    padded = f" {_normalize(text)} "
    candidates: list[tuple[int, TrackedObject]] = []
    for obj in TrackedObject.objects.filter(patient=patient, is_active=True):
        for name in obj.all_names():
            for variant in _variants(_normalize(name)):
                if variant and f" {variant} " in padded:
                    candidates.append((len(variant), obj))
    return max(candidates, key=lambda c: c[0])[1] if candidates else None


def latest_observation(obj: TrackedObject) -> ObjectObservation | None:
    return obj.observations.select_related("place").first()


def _where(observation: ObjectObservation) -> str:
    if observation.place:
        return f"in the {observation.place.name.lower()}"
    label = observation.location_label
    if not label:
        return "somewhere I could not name"
    # Live looks store a kind of room ("a kitchen") when it is none of the patient's named places.
    return f"in {label}" if label.startswith(("a ", "an ")) else f"at {label}"


def _when(observation: ObjectObservation, tz: ZoneInfo, now: datetime) -> str:
    local = observation.observed_at.astimezone(tz)
    clock = local.strftime("%I:%M %p").lstrip("0")
    today = now.astimezone(tz).date()
    if local.date() == today:
        return f"today at {clock}"
    if local.date() == today - timedelta(days=1):
        return f"yesterday at {clock}"
    return f"on {local.strftime('%d %B')} at {clock}"


@dataclass
class LastSeenAnswer:
    status: str  # FOUND | NO_OBSERVATION | UNKNOWN_OBJECT
    answer: str
    tracked_object: TrackedObject | None = None
    observation: ObjectObservation | None = None
    stale: bool = False

    def as_dict(self) -> dict[str, Any]:
        obs = self.observation
        return {
            "status": self.status,
            "answer": self.answer,
            "object": {"id": str(self.tracked_object.id), "name": self.tracked_object.name}
            if self.tracked_object
            else None,
            "last_seen": (
                {
                    "observation_id": str(obs.id),
                    "place": obs.place.name if obs.place else None,
                    "location_label": obs.location_label,
                    "observed_at": obs.observed_at.isoformat(),
                    "confidence": float(obs.confidence) if obs.confidence is not None else None,
                    "source": obs.source,
                }
                if obs
                else None
            ),
            "stale": self.stale,
        }


def last_seen_answer(patient: Patient, obj: TrackedObject | None, *, now: datetime | None = None) -> LastSeenAnswer:
    """Deterministic wording: always "last seen … at <time>", never "it is in …" (BR-03, UI/UX section 8)."""
    now = now or timezone.now()
    if obj is None:
        return LastSeenAnswer(
            "UNKNOWN_OBJECT",
            "I'm not keeping track of that item. Your caregiver can add it to your list of things.",
        )
    observation = latest_observation(obj)
    if observation is None:
        return LastSeenAnswer("NO_OBSERVATION", f"I don't have a recent location for your {obj.name}.", obj)
    tz = ZoneInfo(patient.timezone)
    stale = now - observation.observed_at > STALE_AFTER
    answer = f"Your {obj.name} were last seen {_where(observation)} {_when(observation, tz, now)}."
    if not obj.name.endswith("s"):
        answer = answer.replace(" were last seen", " was last seen")
    if stale:
        answer += " That was a while ago, so it may have been moved."
    return LastSeenAnswer("FOUND", answer, obj, observation, stale)


def _store(
    patient: Patient,
    tracked: dict[str, TrackedObject],
    detections: list[Detection],
    *,
    place: Place | None,
    location_label: str,
    user: User,
) -> list[ObjectObservation]:
    scan_id, now = uuid.uuid4(), timezone.now()
    return [
        ObjectObservation.objects.create(
            tracked_object=tracked[d.label],
            patient=patient,
            place=place,
            location_label=location_label or (place.name if place else ""),
            observed_at=now,
            confidence=round(d.confidence, 3),
            source=ObservationSource.VISION,
            scan_id=scan_id,
            recorded_by=user,
        )
        for d in detections
        if d.label in tracked and d.confidence >= settings.OBJECT_MIN_CONFIDENCE
    ]


def record_scan(
    detector: ObjectDetector,
    patient: Patient,
    jpeg: bytes,
    *,
    place: Place | None,
    location_label: str,
    user: User,
) -> list[ObjectObservation]:
    """Run detection on one frame and store an observation for each tracked object seen confidently enough."""
    tracked = {obj.name: obj for obj in TrackedObject.objects.filter(patient=patient, is_active=True)}
    detections = detector.detect(jpeg, sorted(tracked))
    observations = _store(patient, tracked, detections, place=place, location_label=location_label, user=user)
    log_event(
        "objects.scanned",
        actor=user,
        patient=patient,
        place=place.name if place else location_label,
        found=sorted(o.tracked_object.name for o in observations),
    )
    return observations


@dataclass
class SceneResult:
    place: Place | None
    location_label: str
    observations: list[ObjectObservation]
    others: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "place": {"id": str(self.place.id), "name": self.place.name} if self.place else None,
            "location_label": self.location_label,
            "found": sorted(o.tracked_object.name for o in self.observations),
            "others": self.others,
        }


def record_scene(
    detector: ObjectDetector, patient: Patient, jpeg: bytes, *, user: User, room_hint: str | None = None
) -> SceneResult:
    """Live look: work out which of the patient's rooms this is, then store tracked items seen there."""
    places = {p.name: p for p in Place.objects.filter(patient=patient, is_active=True)}
    tracked = {obj.name: obj for obj in TrackedObject.objects.filter(patient=patient, is_active=True)}
    scene = detector.describe(jpeg, sorted(tracked), sorted(places), room_hint)
    place = places.get(scene.room) if scene.room else None
    label = "" if place else scene.room_guess
    observations = _store(patient, tracked, scene.detections, place=place, location_label=label, user=user)
    log_event(
        "objects.scanned",
        actor=user,
        patient=patient,
        place=place.name if place else label,
        found=sorted(o.tracked_object.name for o in observations),
        live=True,
    )
    return SceneResult(place, label, observations, scene.others)
