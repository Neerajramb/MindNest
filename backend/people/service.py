"""Face enrolment and recognition (FACE-01..05, FR-012..014, BR-02, BR-04)."""

from dataclasses import dataclass
from typing import Any

import numpy as np
from django.conf import settings
from rest_framework.exceptions import ValidationError

from ai.face import MODEL_NAME, MODEL_VERSION, FaceEngine, best_match, confidence_label
from care.models import Patient
from people.models import FaceEmbedding, Person

MAX_FACES_PER_PERSON = 10


def enrol_face(engine: FaceEngine, person: Person, rgb: np.ndarray) -> FaceEmbedding:
    """Add one recognition representation from a photo that shows exactly one clear face."""
    if person.face_embeddings.count() >= MAX_FACES_PER_PERSON:
        raise ValidationError({"image": f"This person already has {MAX_FACES_PER_PERSON} photos."})
    faces = engine.detect(rgb)
    if not faces:
        raise ValidationError({"image": "No face found. Use a clear, well-lit photo facing the camera."})
    good = [f for f in faces if f.good_quality]
    if len(good) != 1:
        message = (
            "More than one face is visible. Use a photo with only this person."
            if len(good) > 1
            else "The face is too small or unclear. Move closer and use better light."
        )
        raise ValidationError({"image": message})
    vector = engine.embed(rgb, good[0])
    return FaceEmbedding.objects.create(
        person=person,
        vector=vector.astype(np.float32).tobytes(),
        model_name=MODEL_NAME,
        model_version=MODEL_VERSION,
        quality_score=round(good[0].score, 3),
    )


@dataclass
class Recognition:
    status: str  # RECOGNIZED | UNKNOWN | NO_FACE | UNCLEAR
    person: Person | None = None
    confidence: str | None = None

    def as_dict(self) -> dict[str, Any]:
        messages = {
            "RECOGNIZED": None,
            "UNKNOWN": "I'm not sure who this is.",
            "NO_FACE": "I can't see a face. Point the camera at the person's face.",
            "UNCLEAR": "The face is not clear enough. Move a little closer and try again.",
        }
        return {
            "status": self.status,
            "message": (
                f"This looks like {self.person.name}"
                + (f", your {self.person.relationship.lower()}." if self.person.relationship else ".")
                if self.person
                else messages[self.status]
            ),
            "person": (
                {"id": str(self.person.id), "name": self.person.name, "relationship": self.person.relationship}
                if self.person
                else None
            ),
            "confidence": self.confidence,
        }


def recognize(engine: FaceEngine, patient: Patient, rgb: np.ndarray) -> Recognition:
    """Compare the largest clear face with this patient's registered people only.

    Below the threshold the answer is "not sure"; a low score is never mapped to a name (BR-04, FACE-05).
    """
    faces = engine.detect(rgb)
    if not faces:
        return Recognition("NO_FACE")
    face = faces[0]
    if not face.good_quality:
        return Recognition("UNCLEAR")
    query = engine.embed(rgb, face)
    candidates = [
        (e.person_id, e.as_array())
        for e in FaceEmbedding.objects.filter(person__patient=patient, person__is_active=True).only(
            "person_id", "vector"
        )
    ]
    match = best_match(query, candidates)
    if match is None or match.similarity < settings.FACE_MATCH_THRESHOLD:
        return Recognition("UNKNOWN")
    person = Person.objects.get(pk=match.person_id)
    return Recognition("RECOGNIZED", person=person, confidence=confidence_label(match.similarity))
