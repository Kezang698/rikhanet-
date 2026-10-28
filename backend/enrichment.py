"""Open-Meteo elevation at GPS and hourly weather at the current gewog centroid."""
import math
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx
from fastapi import HTTPException
from .config import TIMEZONE
from .ingestion import get_sighting
from .inference import PredictionUnavailable, predict_for_trigger

FORECAST = os.environ.get("OPEN_METEO_FORECAST", "https://api.open-meteo.com/v1/forecast")
ELEVATION = os.environ.get("OPEN_METEO_ELEVATION", "https://api.open-meteo.com/v1/elevation")


def fetch_weather_batch(gewogs, start, end):
    """One forecast request covers all neighbour centroids and encoder hours."""
    from .features import FeatureUnavailable
    local_start = start.astimezone(ZoneInfo(TIMEZONE)).strftime("%Y-%m-%dT%H:00")
    local_end = end.astimezone(ZoneInfo(TIMEZONE)).strftime("%Y-%m-%dT%H:00")
    if (datetime.now(timezone.utc) - start).total_seconds() > 90 * 86400:
        raise FeatureUnavailable("Encoder history falls outside live forecast weather coverage; historical weather is required.")
    try:
        with httpx.Client(timeout=25) as client:
            response = client.get(FORECAST, params={
                "latitude": ",".join(str(gewog["centroid_lat"]) for gewog in gewogs),
                "longitude": ",".join(str(gewog["centroid_lon"]) for gewog in gewogs),
                "hourly": "temperature_2m,relative_humidity_2m,precipitation",
                "start_hour": local_start, "end_hour": local_end, "timezone": TIMEZONE,
            })
            response.raise_for_status()
            payload = response.json()
            payload = payload if isinstance(payload, list) else [payload]
            if len(payload) != len(gewogs):
                raise ValueError("Missing neighbour forecasts")
            weather = {}
            for gewog, item in zip(gewogs, payload):
                hourly = item["hourly"]
                for index, hour in enumerate(hourly["time"]):
                    values = {"temp": hourly["temperature_2m"][index], "hum": hourly["relative_humidity_2m"][index], "precip": hourly["precipitation"][index]}
                    if any(value is None or not math.isfinite(float(value)) for value in values.values()):
                        continue
                    weather[(gewog["gewog_code"], hour)] = values
            return weather
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise FeatureUnavailable("Neighbour forecast weather is unavailable. Saved evidence and enrichment are retained; retry prediction later.") from exc


def fetch_weather(gewog, timestamp):
    hour = timestamp.astimezone(ZoneInfo(TIMEZONE)).strftime("%Y-%m-%dT%H:00")
    age = (datetime.now(timezone.utc) - timestamp).total_seconds() / 86400
    if age > 90 or age < -1:
        from .features import FeatureUnavailable
        raise FeatureUnavailable("Historical weather falls outside the live forecast window. Supply its historical weather before running this trigger.")
    try:
        with httpx.Client(timeout=20) as client:
            response = client.get(FORECAST, params={"latitude": gewog["centroid_lat"], "longitude": gewog["centroid_lon"],
                "hourly": "temperature_2m,relative_humidity_2m,precipitation", "start_hour": hour, "end_hour": hour, "timezone": TIMEZONE})
            response.raise_for_status()
            data = response.json()["hourly"]
            index = data["time"].index(hour)
            result = {"temp": data["temperature_2m"][index], "hum": data["relative_humidity_2m"][index], "precip": data["precipitation"][index]}
            if any(value is None or not math.isfinite(float(value)) for value in result.values()):
                raise ValueError("Missing neighbour weather")
            return result
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        from .features import FeatureUnavailable
        raise FeatureUnavailable("Neighbour weather is unavailable. Saved evidence is retained; prediction can be retried.") from exc


def fetch_environment(sighting, gewog):
    hour = sighting["timestamp"].astimezone(ZoneInfo(TIMEZONE)).strftime("%Y-%m-%dT%H:00")
    age = (datetime.now(timezone.utc) - sighting["timestamp"]).total_seconds() / 86400
    if age > 90 or age < -1:
        raise HTTPException(422, "Live enrichment supports recent triggers only; historical records need supplied historical weather")
    try:
        with httpx.Client(timeout=20) as client:
            response = client.get(ELEVATION, params={"latitude": sighting["latitude"], "longitude": sighting["longitude"]})
            response.raise_for_status()
            elevation = response.json()["elevation"][0]
            response = client.get(FORECAST, params={
                "latitude": gewog["centroid_lat"], "longitude": gewog["centroid_lon"],
                "hourly": "temperature_2m,relative_humidity_2m,precipitation",
                "start_hour": hour, "end_hour": hour, "timezone": TIMEZONE,
            })
            response.raise_for_status()
            data = response.json()["hourly"]
            index = data["time"].index(hour)
            result = {"sight_elev": elevation, "cur_temp": data["temperature_2m"][index],
                      "cur_hum": data["relative_humidity_2m"][index], "cur_precip": data["precipitation"][index]}
            if any(v is None or not math.isfinite(float(v)) for v in result.values()):
                raise ValueError("Missing weather values")
            if not 0 <= result["cur_hum"] <= 100 or result["cur_precip"] < 0:
                raise ValueError("Invalid weather values")
            return result
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Open-Meteo enrichment failed; the sighting is saved and can be retried") from exc


def enrich(conn, detection_id):
    # Serialize retries for a trigger; a successful retry reuses stored weather.
    row = get_sighting(conn, detection_id, lock=True)
    if row["discarded"]:
        return {"skipped": "discarded"}
    if row["species"] is None or row["confidence"] is None:
        raise HTTPException(409, "External detection must populate species and confidence before enrichment")
    fields = ("sight_elev", "cur_temp", "cur_hum", "cur_precip")
    if any(row[f] is None for f in fields):
        gewog = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = %s", (row["gewog_code"],)).fetchone()
        values = fetch_environment(row, gewog)
        row = conn.execute("""
            UPDATE sightings SET sight_elev = %(sight_elev)s, cur_temp = %(cur_temp)s,
                cur_hum = %(cur_hum)s, cur_precip = %(cur_precip)s
            WHERE detection_id = %(id)s RETURNING *
        """, {**values, "id": detection_id}).fetchone()
    predictions = conn.execute("SELECT * FROM predictions WHERE detection_id = %s ORDER BY p_present DESC",
                               (detection_id,)).fetchall()
    result = {"detection_id": detection_id, **{field: row[field] for field in fields}}
    if predictions:
        expected = conn.execute("SELECT neighbour_codes FROM gewog_info WHERE gewog_code = %s", (row["gewog_code"],)).fetchone()["neighbour_codes"]
        if set(expected) != {prediction["nbr_code"] for prediction in predictions}:
            return {**result, "prediction_status": "error", "prediction_error": "Stored predictions are incomplete and need reconciliation before retrying.", "predictions": []}
        return {**result, "prediction_status": "complete", "predictions": predictions}
    try:
        # A model failure rolls back only prediction writes, retaining valid enrichment.
        with conn.transaction():
            predictions = predict_for_trigger(conn, detection_id)
    except PredictionUnavailable as exc:
        return {**result, "prediction_status": "unavailable", "prediction_error": str(exc), "predictions": []}
    except (RuntimeError, ValueError, ImportError, OSError, KeyError) as exc:
        import logging
        logging.getLogger("rikhanet.prediction").exception("TFT prediction failed for %s", detection_id)
        return {**result, "prediction_status": "error", "prediction_error": "TFT inference failed. Evidence and weather are saved; check the model artifacts and server diagnostics.", "predictions": []}
    return {**result, "prediction_status": "complete", "predictions": predictions}
