"""Local face detection and recognition: OpenCV YuNet (MIT) + SFace (Apache-2.0).

Runs entirely on the server's CPU; biometric data never leaves it (ADR-0006). Thresholds come from settings
and must be tuned on project test data (AI spec section 16).
"""

import threading
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import cv2
import numpy as np
from django.conf import settings

YUNET_FILE = "face_detection_yunet_2023mar.onnx"
SFACE_FILE = "face_recognition_sface_2021dec.onnx"
MODEL_NAME = "opencv-sface"
MODEL_VERSION = "2021dec"
EMBEDDING_DIM = 128
MIN_FACE_PX = 60


class FaceModelsMissing(RuntimeError):
    """The model files are not installed (run `python manage.py download_models`)."""


@dataclass
class DetectedFace:
    box: np.ndarray  # raw YuNet row: x, y, w, h, 5 landmarks, score
    score: float
    width: int
    height: int

    @property
    def good_quality(self) -> bool:
        return self.score >= settings.FACE_MIN_DETECTION_SCORE and min(self.width, self.height) >= MIN_FACE_PX


class FaceEngine:
    def __init__(self, models_dir: Path) -> None:
        detector_path, recognizer_path = models_dir / YUNET_FILE, models_dir / SFACE_FILE
        if not detector_path.exists() or not recognizer_path.exists():
            raise FaceModelsMissing(str(models_dir))
        self._detector = cv2.FaceDetectorYN.create(str(detector_path), "", (320, 320), 0.6, 0.3, 50)
        self._recognizer = cv2.FaceRecognizerSF.create(str(recognizer_path), "")
        self._lock = threading.Lock()  # OpenCV DNN nets are not thread-safe

    def detect(self, rgb: np.ndarray) -> list[DetectedFace]:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        height, width = bgr.shape[:2]
        with self._lock:
            self._detector.setInputSize((width, height))
            _, faces = self._detector.detect(bgr)
        if faces is None:
            return []
        found = [DetectedFace(box=f, score=float(f[-1]), width=int(f[2]), height=int(f[3])) for f in faces]
        return sorted(found, key=lambda f: f.width * f.height, reverse=True)

    def embed(self, rgb: np.ndarray, face: DetectedFace) -> np.ndarray:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        with self._lock:
            aligned = self._recognizer.alignCrop(bgr, face.box)
            feature = self._recognizer.feature(aligned)
        vector = feature.reshape(-1).astype(np.float32)
        return vector / (np.linalg.norm(vector) or 1.0)


_engine: FaceEngine | None = None
_engine_lock = threading.Lock()


def get_face_engine() -> FaceEngine:
    """Load the models once per process, on first use."""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = FaceEngine(Path(settings.AI_MODELS_DIR))
    return _engine


@dataclass
class Match:
    person_id: UUID
    similarity: float


def best_match(query: np.ndarray, candidates: list[tuple[UUID, np.ndarray]]) -> Match | None:
    """Highest cosine similarity per person (vectors are L2-normalised, so the dot product is the cosine)."""
    best: Match | None = None
    for person_id, vector in candidates:
        similarity = float(np.dot(query, vector))
        if best is None or similarity > best.similarity:
            best = Match(person_id, similarity)
    return best


def confidence_label(similarity: float) -> str:
    """Coarse wording for the UI; raw scores are not shown to patients (UI/UX: never overstate certainty)."""
    threshold = settings.FACE_MATCH_THRESHOLD
    return "high" if similarity >= threshold + 0.15 else "medium"
