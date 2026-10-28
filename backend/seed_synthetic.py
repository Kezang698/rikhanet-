"""Add clearly labelled synthetic elephant history without replacing existing rows.

Run: python -m backend.seed_synthetic --per-gewog 6
The default batch is today's Bhutan date; rerunning a batch skips existing UUIDs.
GPS points are inside the supplied GMC/gewog polygons. All observation and
environmental values are synthetic; no image or prediction is fabricated.
"""
import argparse
import csv
import json
import math
import random
from datetime import datetime, timedelta
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from shapely.geometry import Point
from . import config
from .db import connect
from .helpers.gewog_lookup import boundaries, find_gewog


def seed(per_gewog=6, batch=None):
    if not 1 <= per_gewog <= 24:
        raise ValueError("Choose 1–24 synthetic sightings per gewog")
    now = datetime.now(ZoneInfo(config.TIMEZONE))
    batch = batch or f"synthetic-{now:%Y%m%d}"
    if not batch or len(batch) > 80 or not all(c.isalnum() or c in "-_" for c in batch):
        raise ValueError("Batch must contain up to 80 letters, digits, hyphens or underscores")
    rng = random.Random(batch)
    polygons, gmc = boundaries()
    records = []
    inserted = 0
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"rikhanet:synthetic:{batch}",))
        gewogs = conn.execute("SELECT * FROM gewog_info ORDER BY gewog_code").fetchall()
        if len(gewogs) != 17:
            raise ValueError("Initialize the 17 reference gewogs before adding synthetic data")
        for gewog in gewogs:
            code = gewog["gewog_code"]
            shape = polygons[polygons["gewog_code"] == code].geometry.union_all().intersection(gmc)
            if shape.is_empty:
                raise ValueError(f"No supported GMC geometry for gewog {code}")
            left, bottom, right, top = shape.bounds
            for index in range(per_gewog):
                for _ in range(5000):
                    lat, lon = round(rng.uniform(bottom, top), 8), round(rng.uniform(left, right), 8)
                    if shape.covers(Point(lon, lat)) and find_gewog(lat, lon)["gewog_code"] == code:
                        break
                else:
                    raise ValueError(f"Could not sample a valid point for gewog {code}")
                timestamp = now - timedelta(hours=index * 4, minutes=rng.uniform(15, 30))
                daily = math.sin(2 * math.pi * (timestamp.hour - 8) / 24)
                record = {
                    "detection_id": uuid5(NAMESPACE_URL, f"rikhanet:synthetic:{batch}:{code}:{index}"),
                    "camera_id": f"SYNTH-{code}", "timestamp": timestamp,
                    "latitude": lat, "longitude": lon, "gewog_code": code,
                    "species": "elephant", "confidence": round(rng.uniform(.72, .98), 3),
                    "sight_elev": round(max(0, gewog["mean_elevation"] * rng.uniform(.95, 1.05)), 1),
                    "cur_temp": round(24 + 4 * daily + rng.uniform(-1, 1), 1),
                    "cur_hum": round(82 - 10 * daily + rng.uniform(-3, 3), 1),
                    "cur_precip": rng.choice([0.0, 0.0, 0.0, .2, .6, 1.4]),
                }
                saved = conn.execute("""INSERT INTO sightings
                    (detection_id, camera_id, timestamp, latitude, longitude, gewog_code, species,
                     confidence, sight_elev, cur_temp, cur_hum, cur_precip)
                    VALUES (%(detection_id)s, %(camera_id)s, %(timestamp)s, %(latitude)s, %(longitude)s,
                     %(gewog_code)s, %(species)s, %(confidence)s, %(sight_elev)s, %(cur_temp)s,
                     %(cur_hum)s, %(cur_precip)s)
                    ON CONFLICT (detection_id) DO NOTHING RETURNING detection_id""", record).fetchone()
                inserted += saved is not None
                stored = conn.execute("SELECT * FROM sightings WHERE detection_id = %s", (record["detection_id"],)).fetchone()
                if stored["camera_id"] != record["camera_id"]:
                    raise ValueError("Synthetic UUID conflicts with an existing observation; transaction rolled back")
                records.append(stored)
    manifest = config.ROOT / "data" / f"{batch}-sightings.csv"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    return {"inserted": inserted, "skipped": len(records) - inserted,
            "gewogs": len(gewogs), "batch": batch, "manifest": str(manifest),
            "source_label": "SYNTH- camera IDs; generated GPS, detection scores, elevation and weather"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-gewog", type=int, default=6)
    parser.add_argument("--batch")
    args = parser.parse_args()
    print(json.dumps(seed(args.per_gewog, args.batch), indent=2))
