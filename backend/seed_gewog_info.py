"""Validate and seed the supplied workbook once; never overwrite reference data."""
import math
from pathlib import Path
from openpyxl import load_workbook
from . import config


def read_gewogs(path: Path) -> list[dict]:
    book = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = iter(book["gewogs_info"].values)
        columns = [str(c).strip() for c in next(rows)]
        records = []
        for values in rows:
            row = dict(zip(columns, values))
            code = row.get("Gewog Code")
            if not isinstance(code, (float, int)):
                continue  # footer, total, notes
            record = {
                "gewog_code": int(code), "gewog_name": row["Gewog Name"],
                "centroid_lat": float(row["Centroid Latitude"]),
                "centroid_lon": float(row["Centroid Longitude"]),
                "mean_elevation": float(row["Mean Elevation (m)"]),
                "water_source_count": int(row["Water Source Count"]),
                "neighbour_codes": [int(s.strip()) for s in str(row["Neighbour Gewog Codes"]).split(",")],
            }
            if not all(math.isfinite(record[k]) for k in ("centroid_lat", "centroid_lon", "mean_elevation")):
                raise ValueError("Non-finite reference value")
            records.append(record)
        codes = {r["gewog_code"] for r in records}
        if len(records) != 17 or len(codes) != 17:
            raise ValueError("The GMC workbook must contain exactly 17 distinct gewogs")
        for record in records:
            if not set(record["neighbour_codes"]).issubset(codes) or record["gewog_code"] in record["neighbour_codes"]:
                raise ValueError(f"Invalid neighbours for {record['gewog_code']}")
        return records
    finally:
        book.close()


def seed(conn, path: Path = config.GEWOG_SEED_PATH) -> int:
    records = read_gewogs(path)
    existing = conn.execute("SELECT * FROM gewog_info ORDER BY gewog_code").fetchall()
    if existing:
        expected = {r["gewog_code"]: r for r in records}
        if len(existing) != len(expected):
            raise ValueError("Existing gewog_info differs from workbook; refusing to overwrite it")
        for row in existing:
            ref = expected.get(row["gewog_code"])
            if ref is None or any(
                not math.isclose(row[k], v, rel_tol=1e-6, abs_tol=1e-4)
                if isinstance(v, float) else row[k] != v
                for k, v in ref.items()
            ):
                raise ValueError("Existing gewog_info differs from workbook; reconcile reference data explicitly")
        return 0
    with conn.cursor() as cursor:
        cursor.executemany("""
            INSERT INTO gewog_info (gewog_code, gewog_name, centroid_lat, centroid_lon,
                mean_elevation, water_source_count, neighbour_codes)
            VALUES (%(gewog_code)s, %(gewog_name)s, %(centroid_lat)s, %(centroid_lon)s,
                %(mean_elevation)s, %(water_source_count)s, %(neighbour_codes)s)
        """, records)
    return len(records)
