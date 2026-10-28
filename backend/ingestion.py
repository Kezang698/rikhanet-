"""Persist triggers and supplied detection results; never run a detector here."""
import math
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL
from fastapi import HTTPException
from .helpers.gmc_random_point import generate_gmc_point
from .helpers.gewog_lookup import find_gewog, camera_sample_point
from .models import IngestRequest, DetectionResult


def get_sighting(conn, detection_id: UUID, *, lock=False):
    row = conn.execute("SELECT * FROM sightings WHERE detection_id = %s" +
                       (" FOR UPDATE" if lock else ""), (detection_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Sighting not found")
    return row


def ingest(conn, body: IngestRequest, key: UUID | None = None):
    detection_id = uuid5(NAMESPACE_URL, f"rikhanet:trigger:{key}") if key else uuid4()
    if key:
        # Serialize concurrent retries across all API processes, without another table.
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(detection_id),))
        existing = conn.execute("SELECT * FROM sightings WHERE detection_id = %s", (detection_id,)).fetchone()
        if existing:
            if existing["camera_id"] != body.camera_id or (body.latitude is not None and
                    (existing["latitude"] != body.latitude or existing["longitude"] != body.longitude)):
                raise HTTPException(409, "Idempotency key was already used for a different trigger")
            return existing
    try:
        if body.latitude is None:
            expected = getattr(body, "expected_gewog_code", None)
            point = camera_sample_point(expected, body.camera_id) if expected is not None else generate_gmc_point()
            lat, lon = point["latitude"], point["longitude"]
        else:
            lat, lon = body.latitude, body.longitude
        gewog = find_gewog(lat, lon)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not conn.execute("SELECT 1 FROM gewog_info WHERE gewog_code = %s", (gewog["gewog_code"],)).fetchone():
        raise HTTPException(503, "Gewog reference data is not seeded")
    return conn.execute("""
        INSERT INTO sightings (detection_id, camera_id, latitude, longitude, gewog_code)
        VALUES (%s, %s, %s, %s, %s) RETURNING *
    """, (detection_id, body.camera_id, lat, lon, gewog["gewog_code"])).fetchone()


def complete_detection(conn, detection_id: UUID, body: DetectionResult):
    row = get_sighting(conn, detection_id, lock=True)
    if row["species"] is not None or row["confidence"] is not None:
        same = (row["species"] == body.species and row["confidence"] is not None and
                math.isclose(row["confidence"], body.confidence, abs_tol=1e-6) and
                row["discarded"] == body.discarded)
        if not same:
            raise HTTPException(409, "Detection already completed; conflicting results cannot overwrite it")
        return row
    return conn.execute("""
        UPDATE sightings SET species = %s, confidence = %s, discarded = %s
        WHERE detection_id = %s RETURNING *
    """, (body.species, body.confidence, body.discarded, detection_id)).fetchone()


def with_gewog(conn, row):
    info = conn.execute("SELECT gewog_name FROM gewog_info WHERE gewog_code = %s",
                        (row["gewog_code"],)).fetchone()
    return {**row, "gewog_name": info["gewog_name"]}
