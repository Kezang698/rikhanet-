"""Transient TFT inputs; every encoder row is rebuilt at its own event time."""
import math
from zoneinfo import ZoneInfo
from .config import TIMEZONE

ENCODER_LENGTH = 24
MAX_SINCE_H = 168.0
FEATURE_VERSION = "pair-history-v1"


def haversine_km(lat1, lon1, lat2, lon2):
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((phi2 - phi1) / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1, max(0, a))))


def window_features(conn, code, timestamp):
    row = conn.execute("""
        SELECT count(*) FILTER (WHERE timestamp >= %(ts)s - interval '6 hours') AS cnt_6h,
               count(*) FILTER (WHERE timestamp >= %(ts)s - interval '12 hours') AS cnt_12h,
               count(*) FILTER (WHERE timestamp >= %(ts)s - interval '24 hours') AS cnt_24h,
               max(timestamp) AS latest
        FROM sightings WHERE gewog_code = %(code)s AND timestamp < %(ts)s
          AND discarded = FALSE AND confidence IS NOT NULL AND lower(species) LIKE '%%elephant%%'
    """, {"ts": timestamp, "code": code}).fetchone()
    since = MAX_SINCE_H if row["latest"] is None else min(MAX_SINCE_H, (timestamp - row["latest"]).total_seconds() / 3600)
    return {"cnt_6h": row["cnt_6h"], "cnt_12h": row["cnt_12h"], "cnt_24h": row["cnt_24h"],
            "since_h": since, "no_prev": float(row["latest"] is None or since >= MAX_SINCE_H)}


def pair_history(conn, cur_code, nbr_code, timestamp):
    rows = conn.execute("""
        SELECT * FROM sightings WHERE gewog_code IN (%s, %s) AND timestamp < %s
          AND discarded = FALSE AND confidence IS NOT NULL AND lower(species) LIKE '%%elephant%%'
        ORDER BY timestamp DESC, detection_id DESC LIMIT %s
    """, (cur_code, nbr_code, timestamp, ENCODER_LENGTH)).fetchall()
    return list(reversed(rows))


class FeatureUnavailable(RuntimeError):
    pass


def event_features(conn, event, current, neighbour, weather):
    """Each event retains its GPS/elevation, timestamp and historical-hour weather.

    Pair codes stay fixed. A neighbouring-gewog event needs current-pair centroid
    weather rather than incorrectly reusing that neighbouring event's cur_*.
    """
    ts = event["timestamp"]
    if any(event[field] is None for field in ("latitude", "longitude", "sight_elev")):
        raise FeatureUnavailable("Pair history contains events without GPS/elevation. Enrich the actual history; it cannot be padded with the current image.")
    if event["gewog_code"] == current["gewog_code"] and all(event[field] is not None for field in ("cur_temp", "cur_hum", "cur_precip")):
        cur_weather = {"temp": event["cur_temp"], "hum": event["cur_hum"], "precip": event["cur_precip"]}
    else:
        cur_weather = weather(current, ts)
    nbr_weather = weather(neighbour, ts)
    cur_window = window_features(conn, current["gewog_code"], ts)
    nbr_window = window_features(conn, neighbour["gewog_code"], ts)
    local = ts.astimezone(ZoneInfo(TIMEZONE))
    hour = local.hour + local.minute / 60
    row = {"cur_code": str(current["gewog_code"]), "nbr_code": str(neighbour["gewog_code"]),
           "pair": f"{current['gewog_code']}_{neighbour['gewog_code']}",
           "nbr_elev": float(neighbour["mean_elevation"]), "nbr_water": float(neighbour["water_source_count"]),
           "nbr_lat": float(neighbour["centroid_lat"]), "nbr_lon": float(neighbour["centroid_lon"]),
           "sight_elev": float(event["sight_elev"]),
           "dist_km": haversine_km(event["latitude"], event["longitude"], neighbour["centroid_lat"], neighbour["centroid_lon"]),
           "elev_diff": float(event["sight_elev"] - neighbour["mean_elevation"]),
           "hour_sin": math.sin(2 * math.pi * hour / 24), "hour_cos": math.cos(2 * math.pi * hour / 24),
           "year": float(local.year)}
    for prefix, values in (("cur", cur_weather), ("nbr", nbr_weather)):
        for field in ("temp", "hum", "precip"):
            value = values[field]
            if value is None or not math.isfinite(float(value)):
                raise FeatureUnavailable("Weather is missing for an actual encoder event; no substitute value was generated.")
            row[f"{prefix}_{field}"] = float(value)
    for prefix, window in (("cur", cur_window), ("nbr", nbr_window)):
        for field in ("cnt_6h", "cnt_12h", "cnt_24h", "since_h"):
            row[f"{prefix}_{field}"] = math.log1p(window[field])
        row[f"{prefix}_no_prev"] = window["no_prev"]
    return row


def build_pair_rows(conn, trigger, current, neighbour, weather, min_history=24):
    history = pair_history(conn, current["gewog_code"], neighbour["gewog_code"], trigger["timestamp"])
    if len(history) < min_history:
        raise FeatureUnavailable(f"Only {len(history)} historical elephant events are available for {current['gewog_name']} → {neighbour['gewog_name']}; this checkpoint needs at least {min_history} and uses up to 24. No history is fabricated.")
    return [dict(event_features(conn, event, current, neighbour, weather), time_idx=index)
            for index, event in enumerate([*history, trigger])]
