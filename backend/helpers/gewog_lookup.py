"""Callable equivalent of the supplied standalone test_gewog.py lookup.

Use the original shapefile, not the simplified frontend rings. Intersect with
GMC so that the part of Ngangla outside GMC cannot be ingested accidentally.
"""
from functools import lru_cache
import hashlib
import random
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point
import shapely


@lru_cache(maxsize=1)
def boundaries():
    folder = Path(__file__).parent / "data"
    gewogs = gpd.read_file(folder / "GMC_Gewogs.shp").to_crs("EPSG:4326")
    gmc = gpd.read_file(folder / "GMC_Boundary.shp").to_crs("EPSG:4326")
    return gewogs, shapely.make_valid(gmc.geometry.union_all())


def find_gewog(lat: float, lon: float) -> dict:
    gewogs, gmc = boundaries()
    point = Point(lon, lat)
    if not gmc.covers(point):
        raise ValueError("Coordinates are outside the GMC project boundary")
    matches = gewogs[gewogs.geometry.covers(point)].sort_values("gewog_code")
    if matches.empty:
        raise ValueError("Coordinates do not resolve to a GMC gewog")
    match = matches.iloc[0]
    return {"gewog_code": int(match["gewog_code"]), "gewog_name": str(match["name_eng"])}


@lru_cache(maxsize=1024)
def camera_sample_point(gewog_code: int, camera_id: str) -> dict:
    """Stable sample GPS inside the selected gewog's exact GMC intersection."""
    gewogs, gmc = boundaries()
    selected = gewogs[gewogs.gewog_code == gewog_code]
    if selected.empty:
        raise ValueError("Unknown selected camera gewog")
    polygon = shapely.make_valid(selected.geometry.union_all()).intersection(gmc)
    if polygon.is_empty:
        raise ValueError("Selected camera gewog has no supported GMC location")
    seed = hashlib.sha256(f"rikhanet:camera:{gewog_code}:{camera_id}".encode()).digest()
    rng = random.Random(int.from_bytes(seed, "big"))
    left, bottom, right, top = polygon.bounds
    for _ in range(5000):
        lat, lon = round(rng.uniform(bottom, top), 8), round(rng.uniform(left, right), 8)
        if polygon.covers(Point(lon, lat)) and find_gewog(lat, lon)["gewog_code"] == gewog_code:
            return {"latitude": lat, "longitude": lon}
    point = polygon.representative_point()
    if find_gewog(point.y, point.x)["gewog_code"] != gewog_code:
        raise ValueError("Could not resolve a sample location inside the selected gewog")
    return {"latitude": point.y, "longitude": point.x}
