"""Validate a whole CSV before inserting; retries of the same file are safe."""
import csv
import hashlib
from io import StringIO
import math
import re
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid5, NAMESPACE_URL
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from .config import TIMEZONE
from .helpers.gewog_lookup import find_gewog

MAX_CSV_BYTES = 2_000_000
MAX_ROWS = 1000
REQUIRED = {"species", "date", "time", "zone", "camera", "confidence", "latitude", "longitude"}
OPTIONAL = {"detection_id"}


def parse_csv(data, gewogs):
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(422, "Save the CSV as UTF-8") from exc
    reader = csv.DictReader(StringIO(text, newline=""), strict=True)
    try:
        fields = reader.fieldnames or []
    except csv.Error as exc:
        raise HTTPException(422, "CSV header is malformed") from exc
    if len(set(fields)) != len(fields) or not REQUIRED.issubset(fields) or set(fields) - REQUIRED - OPTIONAL:
        raise HTTPException(422, "CSV columns: species,date,time,zone,camera,confidence,latitude,longitude; optional detection_id")
    references = {str(row["gewog_code"]): row for row in gewogs}
    references.update({row["gewog_name"].casefold(): row for row in gewogs})
    fingerprint = hashlib.sha256(data).hexdigest()
    records = []
    seen = set()
    try:
        for number, values in enumerate(reader, 2):
            if len(records) >= MAX_ROWS:
                raise HTTPException(413, "Import at most 1,000 rows per file")
            if None in values or any(v is None for v in values.values()):
                raise ValueError("Row has the wrong number of columns")
            values = {key: value.strip() for key, value in values.items()}
            if any("\x00" in value for value in values.values()):
                raise ValueError("CSV values cannot contain null characters")
            if not all(values[field] for field in REQUIRED):
                raise ValueError("Required value is empty")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", values["date"]) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", values["time"]):
                raise ValueError("Use YYYY-MM-DD and HH:MM in Bhutan time")
            timestamp = datetime.strptime(f"{values['date']} {values['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo(TIMEZONE))
            if timestamp > datetime.now(timezone.utc) + timedelta(minutes=5):
                raise ValueError("Sighting timestamp is in the future")
            confidence, lat, lon = (float(values[key]) for key in ("confidence", "latitude", "longitude"))
            if not all(math.isfinite(value) for value in (confidence, lat, lon)) or not 0 <= confidence <= 1 or not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise ValueError("Invalid confidence or GPS coordinates")
            if len(values["species"]) > 120 or len(values["camera"]) > 120:
                raise ValueError("Species and camera must contain at most 120 characters")
            reference = references.get(values["zone"]) or references.get(values["zone"].casefold())
            if reference is None:
                raise ValueError("Unknown gewog name or code")
            resolved = find_gewog(lat, lon)
            if resolved["gewog_code"] != reference["gewog_code"]:
                raise ValueError("GPS coordinates do not match the supplied gewog")
            detection_id = UUID(values["detection_id"]) if values.get("detection_id") else uuid5(NAMESPACE_URL, f"rikhanet:csv:{fingerprint}:{number}")
            if detection_id in seen:
                raise ValueError("Duplicate detection_id in file")
            seen.add(detection_id)
            records.append({"detection_id": detection_id, "camera_id": values["camera"],
                "timestamp": timestamp, "latitude": lat, "longitude": lon,
                "gewog_code": resolved["gewog_code"], "species": values["species"], "confidence": confidence})
    except (csv.Error, ValueError, KeyError) as exc:
        raise HTTPException(422, f"CSV row {reader.line_num}: {exc}") from exc
    if not records:
        raise HTTPException(422, "CSV has no sighting rows")
    return records


def import_records(conn, data, dry_run=False):
    references = conn.execute("SELECT gewog_code, gewog_name FROM gewog_info").fetchall()
    records = parse_csv(data, references)
    inserted = skipped = 0
    # Stable lock order prevents deadlocks when two files share supplied UUIDs.
    for record in sorted(records, key=lambda row: row["detection_id"]):
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(record["detection_id"]),))
        existing = conn.execute("SELECT * FROM sightings WHERE detection_id = %s FOR UPDATE", (record["detection_id"],)).fetchone()
        if existing:
            same = all(math.isclose(existing[key], value, rel_tol=0, abs_tol=1e-6) if isinstance(value, float) and existing[key] is not None
                       else existing[key] == value for key, value in record.items())
            if not same or existing["discarded"]:
                raise HTTPException(409, f"Existing detection {record['detection_id']} conflicts with CSV; no rows imported")
            skipped += 1
            continue
        inserted += 1
        if not dry_run:
            conn.execute("""INSERT INTO sightings (detection_id, camera_id, timestamp, latitude, longitude, gewog_code, species, confidence)
                VALUES (%(detection_id)s, %(camera_id)s, %(timestamp)s, %(latitude)s, %(longitude)s, %(gewog_code)s, %(species)s, %(confidence)s)""", record)
    return {"validated": len(records), "imported": inserted if not dry_run else 0,
            "new_rows": inserted, "skipped": skipped, "dry_run": dry_run,
            "preview": [{**row, "gewog_name": next(ref["gewog_name"] for ref in references if ref["gewog_code"] == row["gewog_code"])} for row in records[:5]]}
