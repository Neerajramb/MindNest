import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.exceptions import ValidationError

from core.media import read_image


def _upload(image: Image.Image, fmt: str = "JPEG", **save: object) -> SimpleUploadedFile:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **save)
    return SimpleUploadedFile("photo", buffer.getvalue())


def test_large_photo_is_downscaled_and_returned_as_rgb() -> None:
    array = read_image(_upload(Image.new("RGB", (3000, 2000), (10, 20, 30))))
    assert array.shape == (853, 1280, 3)
    assert tuple(array[0, 0]) == (10, 20, 30)


def test_exif_orientation_is_applied() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise
    array = read_image(_upload(Image.new("RGB", (400, 200)), exif=exif))
    assert array.shape[:2] == (400, 200)


@pytest.mark.parametrize("content", [b"", b"plain text", b"\x89PNG\r\n\x1a\nbroken"])
def test_non_images_are_rejected(content: bytes) -> None:
    with pytest.raises(ValidationError):
        read_image(SimpleUploadedFile("x.jpg", content))


def test_missing_and_oversized_uploads_are_rejected() -> None:
    with pytest.raises(ValidationError):
        read_image(None)
    with override_settings(MAX_IMAGE_UPLOAD_BYTES=100), pytest.raises(ValidationError):
        read_image(_upload(Image.new("RGB", (200, 200))))


def test_unsupported_format_is_rejected() -> None:
    with pytest.raises(ValidationError):
        read_image(_upload(Image.new("RGB", (50, 50)), fmt="BMP"))
