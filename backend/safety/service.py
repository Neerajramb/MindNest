"""Geofence evaluation and safety alerts (SAFE-02..05, FR-021, FR-022, BR-07, NFR-009)."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from audit.service import log_event
from care.models import Patient
from notifications.models import AlertType, Severity
from notifications.service import create_alert
from safety.models import Geofence, Location, SafetyState, ZoneStatus

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _distance_to(zone: Geofence, location: Location) -> float:
    return haversine_m(float(zone.latitude), float(zone.longitude), float(location.latitude), float(location.longitude))


def locate(location: Location, zones: list[Geofence]) -> tuple[str, Geofence | None, Geofence | None]:
    """Classify a location against the active zones.

    Returns (status, zone_inside, nearest_zone). A point counts as outside only when it is outside every zone
    even allowing for the reported accuracy, so GPS jitter near the edge does not raise false alarms.
    """
    if not zones:
        return ZoneStatus.UNKNOWN, None, None
    accuracy = float(location.accuracy_m or 0)
    distances = sorted(((_distance_to(z, location), z) for z in zones), key=lambda pair: pair[0])
    for distance, zone in distances:
        if distance - accuracy <= zone.radius_m:
            return ZoneStatus.INSIDE, zone, zone
    return ZoneStatus.OUTSIDE, None, distances[0][1]


def _local_time(patient: Patient, moment: datetime) -> str:
    return moment.astimezone(ZoneInfo(patient.timezone)).strftime("%H:%M")


@transaction.atomic
def record_location(patient: Patient, *, actor: User | None = None, **fields: Any) -> tuple[Location, SafetyState]:
    location = Location.objects.create(patient=patient, **fields)
    state, _ = SafetyState.objects.select_for_update().get_or_create(patient=patient)
    zones = list(Geofence.objects.filter(patient=patient, is_active=True))
    status, inside_zone, nearest = locate(location, zones)

    previous = state.status
    state.last_location = location
    state.stale_alerted_at = None
    if status != previous:
        state.status = status
        state.changed_at = location.recorded_at
    if status == ZoneStatus.INSIDE:
        state.zone = inside_zone
    state.save()

    if status == ZoneStatus.OUTSIDE and previous != ZoneStatus.OUTSIDE:
        last_zone = state.zone or nearest
        zone_name = last_zone.name if last_zone else "safe zone"
        create_alert(
            patient,
            AlertType.GEOFENCE,
            Severity.HIGH,
            f"Left the safe zone “{zone_name}” at {_local_time(patient, location.recorded_at)}.",
            data={
                "location_id": str(location.id),
                "latitude": str(location.latitude),
                "longitude": str(location.longitude),
                "accuracy_m": str(location.accuracy_m) if location.accuracy_m is not None else None,
                "recorded_at": location.recorded_at.isoformat(),
                "zone": zone_name,
                "source": location.source,
                "is_mocked": location.is_mocked,
            },
            actor=actor,
        )
        log_event("geofence.exit", actor=actor, patient=patient, zone=zone_name, source=location.source)
    elif status == ZoneStatus.INSIDE and previous == ZoneStatus.OUTSIDE and inside_zone:
        log_event("geofence.returned", actor=actor, patient=patient, zone=inside_zone.name)
    return location, state


def reset_state(patient: Patient) -> None:
    """Zones changed: forget the previous evaluation so the next report is judged against the new zones."""
    SafetyState.objects.filter(patient=patient).update(status=ZoneStatus.UNKNOWN, zone=None, changed_at=None)


@dataclass
class SafetySummary:
    status: str
    zone_name: str | None
    sharing_enabled: bool
    has_zones: bool
    stale: bool
    location: Location | None

    def as_dict(self) -> dict[str, Any]:
        loc = self.location
        return {
            # Never report "inside" from an old or missing fix (UI/UX C-10: do not imply the patient is safe).
            "status": ZoneStatus.UNKNOWN if self.stale or loc is None else self.status,
            "zone_name": None if self.stale else self.zone_name,
            "location_sharing_enabled": self.sharing_enabled,
            "has_safe_zones": self.has_zones,
            "location_stale": self.stale,
            "last_location": (
                {
                    "latitude": float(loc.latitude),
                    "longitude": float(loc.longitude),
                    "accuracy_m": float(loc.accuracy_m) if loc.accuracy_m is not None else None,
                    "recorded_at": loc.recorded_at.isoformat(),
                    "source": loc.source,
                    "is_mocked": loc.is_mocked,
                }
                if loc
                else None
            ),
        }


def summarize(patient: Patient, *, now: datetime | None = None) -> SafetySummary:
    now = now or timezone.now()
    state = SafetyState.objects.filter(patient=patient).select_related("zone", "last_location").first()
    location = Location.objects.filter(patient=patient).order_by("-recorded_at").first()
    stale = location is None or location.recorded_at < now - timedelta(minutes=settings.LOCATION_STALE_MINUTES)
    return SafetySummary(
        status=state.status if state else ZoneStatus.UNKNOWN,
        zone_name=state.zone.name if state and state.zone else None,
        sharing_enabled=patient.location_sharing_enabled,
        has_zones=Geofence.objects.filter(patient=patient, is_active=True).exists(),
        stale=stale,
        location=location,
    )


def check_stale_locations(*, now: datetime | None = None) -> int:
    """Alert once per episode when a patient with safe zones stops reporting location (BR-07, SRS section 7)."""
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.LOCATION_STALE_MINUTES)
    alerted = 0
    patients = Patient.objects.filter(geofences__is_active=True, location_sharing_enabled=True).distinct()
    for patient in patients:
        state, _ = SafetyState.objects.get_or_create(patient=patient)
        latest = Location.objects.filter(patient=patient).order_by("-recorded_at").first()
        if latest is None or latest.recorded_at >= cutoff or state.stale_alerted_at is not None:
            continue
        create_alert(
            patient,
            AlertType.LOCATION_UNAVAILABLE,
            Severity.WARNING,
            f"No location update since {_local_time(patient, latest.recorded_at)}. "
            "Safe-zone monitoring is paused until the phone reports again.",
            data={"last_recorded_at": latest.recorded_at.isoformat()},
        )
        state.stale_alerted_at = now
        state.save(update_fields=["stale_alerted_at"])
        alerted += 1
    return alerted


def purge_old_locations(*, now: datetime | None = None) -> int:
    now = now or timezone.now()
    cutoff = now - timedelta(days=settings.LOCATION_RETENTION_DAYS)
    deleted, _ = (
        Location.objects.filter(recorded_at__lt=cutoff)
        .exclude(pk__in=SafetyState.objects.exclude(last_location=None).values("last_location"))
        .delete()
    )
    return deleted


def sos(patient: Patient, user: User) -> dict[str, Any]:
    """Patient pressed Emergency (P-15): HIGH alert to caregivers with the latest location if known."""
    latest = Location.objects.filter(patient=patient).order_by("-recorded_at").first()
    data: dict[str, Any] = {}
    if latest is not None:
        data = {
            "latitude": str(latest.latitude),
            "longitude": str(latest.longitude),
            "recorded_at": latest.recorded_at.isoformat(),
        }
    alert = create_alert(
        patient, AlertType.SOS, Severity.HIGH, "Asked for help from the Emergency button.", data=data, actor=user
    )
    return {"alert_id": str(alert.id)}
