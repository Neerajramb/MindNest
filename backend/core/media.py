"""Safe handling of uploaded photos (API spec section 17: validate media type and size).

Images are decoded in memory and never written to disk. EXIF metadata (including GPS) is discarded, and the
orientation tag is applied first so phone photos are upright.
"""

import io

import numpy as np
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "MPO"}
MAX_SIDE = 1280
MAX_PIXELS = 40_000_000  # refuse decompression bombs


def read_image(upload: UploadedFile | None, field: str = "image") -> np.ndarray:
    """Return the upload as an RGB uint8 array (height, width, 3), downscaled to at most MAX_SIDE."""
    if upload is None:
        raise ValidationError({field: "Attach a photo."})
    if upload.size is None or upload.size > settings.MAX_IMAGE_UPLOAD_BYTES:
        raise ValidationError({field: "The photo is too large."})
    data = upload.read()
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise ValidationError({field: "Use a JPEG or PNG photo."})
            if probe.width * probe.height > MAX_PIXELS:
                raise ValidationError({field: "The photo is too large."})
            probe.verify()
        with Image.open(io.BytesIO(data)) as opened:
            upright = ImageOps.exif_transpose(opened).convert("RGB")
            upright.thumbnail((MAX_SIDE, MAX_SIDE))
            return np.asarray(upright, dtype=np.uint8).copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValidationError({field: "This file is not a readable photo."}) from exc


def to_jpeg_bytes(rgb: np.ndarray, quality: int = 85) -> bytes:
    """Re-encode a decoded image (metadata-free) for sending to an external vision service."""
    buffer = io.BytesIO()
    Image.fromarray(rgb).save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()
