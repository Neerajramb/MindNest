"""Download the local AI model files into AI_MODELS_DIR and verify their checksums."""

import hashlib
import urllib.request
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# OpenCV Zoo models. Hashes recorded when the files were first fetched and checked (2026-10-10).
MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Command(BaseCommand):
    help = "Download and verify the local face-recognition models."

    def handle(self, *args: Any, **options: Any) -> None:
        target = Path(settings.AI_MODELS_DIR)
        target.mkdir(parents=True, exist_ok=True)
        for name, (url, expected) in MODELS.items():
            path = target / name
            if path.exists() and sha256(path) == expected:
                self.stdout.write(f"{name}: already present")
                continue
            self.stdout.write(f"{name}: downloading…")
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)  # noqa: S310 - fixed https URL, verified below
            actual = sha256(tmp)
            if actual != expected:
                tmp.unlink(missing_ok=True)
                raise CommandError(f"{name}: checksum mismatch ({actual}); not installed.")
            tmp.replace(path)
            self.stdout.write(self.style.SUCCESS(f"{name}: installed and verified"))
