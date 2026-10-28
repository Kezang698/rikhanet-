"""
gmc_random_point.py
-------------------
Generates ONE random GPS coordinate inside the Gelephu Mindfulness City (GMC)
boundary and reports which gewog it falls in.

Method (no rejection loop):
  1. The GMC polygon is split into triangles (constrained Delaunay).
  2. A triangle is chosen with probability proportional to its area.
  3. A uniform random point is drawn inside that triangle.
  => the point is inside GMC by construction.
  4. A final check confirms the point is inside GMC and inside one of the
     17 GMC gewogs (matched by spatial relationship, not by name).

Sampling is done in the Bhutan National Grid (EPSG:5266, metres) so the spread
is uniform over real area, then converted to WGS84 longitude/latitude.

Usage:
    python gmc_random_point.py            # prints one point
    from gmc_random_point import generate_gmc_point   # use in the backend
"""
import os
import secrets
import numpy as np
import geopandas as gpd
import shapely
from shapely.geometry import Point

HERE = os.path.dirname(os.path.abspath(__file__))
GMC_SHP = os.path.join(HERE, "data", "GMC_Boundary.shp")
GEWOG_SHP = os.path.join(HERE, "data", "GMC_Gewogs.shp")
WORK_CRS = "EPSG:5266"   # metric CRS used for sampling
OUT_CRS = "EPSG:4326"    # longitude / latitude output

_cache = {}


def _load():
    """Load boundaries and triangulate GMC once; reused on every call."""
    if _cache:
        return _cache
    gmc = gpd.read_file(GMC_SHP).to_crs(WORK_CRS)
    gewogs = gpd.read_file(GEWOG_SHP).to_crs(WORK_CRS)
    poly = shapely.make_valid(gmc.geometry.union_all())
    tris = [t for t in shapely.constrained_delaunay_triangles(poly).geoms]
    tris = [t for t in tris if poly.covers(t.representative_point())]
    areas = np.array([t.area for t in tris])
    coords = np.array([np.array(t.exterior.coords)[:3] for t in tris])  # (n,3,2)
    _cache.update(
        poly=poly, gewogs=gewogs, coords=coords, probs=areas / areas.sum(),
        to_wgs=gpd.GeoSeries([poly], crs=WORK_CRS),
    )
    return _cache


def generate_gmc_point(rng=None):
    """Return one random point inside GMC as a dict (lon/lat in WGS84)."""
    c = _load()
    rng = rng or np.random.default_rng(secrets.randbits(64))  # different every run
    while True:  # loops again only in the extremely rare case the final check fails
        i = rng.choice(len(c["probs"]), p=c["probs"])
        a, b, d = c["coords"][i]
        r1, r2 = rng.random(), rng.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        x, y = a + r1 * (b - a) + r2 * (d - a)
        pt = Point(x, y)

        # ---- verification ----
        if not c["poly"].covers(pt):
            continue
        hit = c["gewogs"][c["gewogs"].geometry.covers(pt)]
        if hit.empty:
            continue
        g = hit.sort_values("gewog_code").iloc[0]

        lon, lat = gpd.GeoSeries([pt], crs=WORK_CRS).to_crs(OUT_CRS).iloc[0].coords[0]
        return {
            "longitude": round(lon, 8),
            "latitude": round(lat, 8),
            "gewog_name": g["name_eng"],
            "gewog_code": int(g["gewog_code"]),
        }


if __name__ == "__main__":
    p = generate_gmc_point()
    print(f"Longitude : {p['longitude']}")
    print(f"Latitude  : {p['latitude']}")
    print(f"Gewog     : {p['gewog_name']} (code {p['gewog_code']})")
