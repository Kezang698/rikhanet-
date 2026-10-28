"""Bounded request bodies and immutable local camera evidence."""
import hashlib
from io import BytesIO
import re
from uuid import uuid4
import warnings
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from . import config
from .ingestion import get_sighting

MAX_IMAGE_BYTES = 10 * 1024 * 1024
FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}


async def read_limited(request, limit):
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError as exc:
        raise HTTPException(400, "Invalid Content-Length") from exc
    if length > limit:
        raise HTTPException(413, "Upload exceeds the size limit")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(413, "Upload exceeds the size limit")
        body.extend(chunk)
    if not body:
        raise HTTPException(400, "Upload is empty")
    return bytes(body)


def validate_image(data, content_type):
    if content_type not in {value[0] for value in FORMATS.values()}:
        raise HTTPException(415, "Use a JPEG, PNG or WebP image")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=list(FORMATS)) as image:
                media_type, extension = FORMATS[image.format]
                if media_type != content_type:
                    raise HTTPException(415, "Image contents do not match Content-Type")
                if image.width * image.height > 25_000_000:
                    raise HTTPException(413, "Use an image with at most 25 million pixels")
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(422, "Camera evidence must be a single still frame")
                image.verify()
            with Image.open(BytesIO(data), formats=list(FORMATS)) as image:
                image.load()
        return extension
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(422, "Image could not be decoded") from exc


def store_image(conn, detection_id, data, content_type):
    extension = validate_image(data, content_type)
    row = get_sighting(conn, detection_id, lock=True)
    if row["discarded"]:
        raise HTTPException(409, "Discarded detections cannot receive evidence")
    digest = hashlib.sha256(data).hexdigest()
    name = f"{detection_id}-{digest}.{extension}"
    if row["image_path"] and row["image_path"] != name:
        raise HTTPException(409, "Evidence is already attached; it cannot be overwritten")
    directory = config.UPLOAD_DIR.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / name
    if not destination.exists():
        temporary = directory / f"{uuid4()}.tmp"
        try:
            temporary.write_bytes(data)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    conn.execute("UPDATE sightings SET image_path = %s WHERE detection_id = %s", (name, detection_id))
    return {"detection_id": detection_id, "image_url": f"/sightings/{detection_id}/image"}


def image_file(conn, detection_id):
    row = get_sighting(conn, detection_id)
    name = row["image_path"]
    if row["discarded"] or not name:
        raise HTTPException(404, "No image is stored for this sighting")
    match = re.fullmatch(re.escape(str(detection_id)) + r"-[0-9a-f]{64}\.(jpg|png|webp)", name)
    if not match:
        raise HTTPException(404, "Stored image reference is invalid")
    directory = config.UPLOAD_DIR.resolve()
    path = (directory / name).resolve()
    if path.parent != directory or not path.is_file():
        raise HTTPException(404, "Stored image is unavailable")
    types = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return path, types[match.group(1)]
