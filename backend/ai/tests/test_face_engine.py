"""Runs the real OpenCV models when they are installed (`python manage.py download_models`)."""

from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from django.conf import settings

from ai.face import best_match, confidence_label, get_face_engine

MODELS_PRESENT = (Path(settings.AI_MODELS_DIR) / "face_recognition_sface_2021dec.onnx").exists()


@pytest.mark.skipif(not MODELS_PRESENT, reason="face models not downloaded")
def test_real_detector_finds_no_face_in_a_plain_image() -> None:
    engine = get_face_engine()
    assert engine.detect(np.full((480, 640, 3), 180, dtype=np.uint8)) == []


def test_best_match_picks_highest_cosine() -> None:
    a, b = np.zeros(128, np.float32), np.zeros(128, np.float32)
    a[0], b[1] = 1.0, 1.0
    query = np.zeros(128, np.float32)
    query[0] = 1.0
    anna, ben = uuid4(), uuid4()
    match = best_match(query, [(anna, a), (ben, b)])
    assert match is not None
    assert (match.person_id, round(match.similarity, 3)) == (anna, 1.0)
    assert best_match(query, []) is None


def test_confidence_labels_follow_threshold() -> None:
    threshold = settings.FACE_MATCH_THRESHOLD
    assert confidence_label(threshold + 0.2) == "high"
    assert confidence_label(threshold + 0.01) == "medium"
