"""Validated, atomic neighbour inference; no demonstration probabilities."""
from .features import build_pair_rows, pair_history, FeatureUnavailable
from .config import TIMEZONE
from zoneinfo import ZoneInfo
from .tft_runtime import readiness, get_runtime

LOW_MAX = 0.25
HIGH_MIN = 0.60


def risk_label(p: float) -> str:
    if not 0 <= p <= 1:
        raise ValueError("Probability must be finite and between zero and one")
    return "LOW" if p < LOW_MAX else "MEDIUM" if p < HIGH_MIN else "HIGH"


def prediction_status():
    return readiness()


class PredictionUnavailable(RuntimeError):
    pass


def predict_for_trigger(conn, detection_id):
    status = prediction_status()
    if status["status"] not in ("ready", "prototype"):
        raise PredictionUnavailable(status["reason"])
    from .enrichment import fetch_weather_batch
    runtime = get_runtime()
    trigger = conn.execute("SELECT * FROM sightings WHERE detection_id = %s FOR UPDATE", (detection_id,)).fetchone()
    if trigger["discarded"]:
        return []
    if "elephant" not in (trigger["species"] or "").lower():
        raise PredictionUnavailable("This model forecasts elephant occurrence only.")
    existing = conn.execute("SELECT * FROM predictions WHERE detection_id = %s ORDER BY p_present DESC", (detection_id,)).fetchall()
    if existing:
        expected = conn.execute("SELECT neighbour_codes FROM gewog_info WHERE gewog_code = %s", (trigger["gewog_code"],)).fetchone()["neighbour_codes"]
        if set(expected) != {prediction["nbr_code"] for prediction in existing}:
            raise PredictionUnavailable("Stored predictions are incomplete and need reconciliation.")
        return existing
    current = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = %s", (trigger["gewog_code"],)).fetchone()
    neighbours = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = ANY(%s) ORDER BY gewog_code", (current["neighbour_codes"],)).fetchall()
    minimum = getattr(runtime, "min_encoder_length", 24)
    # Reject cold start before requesting forecast weather.
    histories = [pair_history(conn, current["gewog_code"], neighbour["gewog_code"], trigger["timestamp"]) for neighbour in neighbours]
    for neighbour, history in zip(neighbours, histories):
        if len(history) < minimum:
            raise PredictionUnavailable(f"{current['gewog_name']} → {neighbour['gewog_name']} needs at least {minimum} previous elephant events; {len(history)} are available. The checkpoint supports up to 24 history events.")
    first = min((event["timestamp"] for history in histories for event in history), default=trigger["timestamp"])
    cache = None
    def weather(gewog, timestamp):
        nonlocal cache
        if cache is None:
            cache = fetch_weather_batch([current, *neighbours], first, trigger["timestamp"])
        key = (gewog["gewog_code"], timestamp.astimezone(ZoneInfo(TIMEZONE)).strftime("%Y-%m-%dT%H:00"))
        if key not in cache:
            raise FeatureUnavailable("Forecast weather is missing for a history event; no fallback values were supplied.")
        return cache[key]
    outputs = []
    try:
        for neighbour in neighbours:
            rows = build_pair_rows(conn, trigger, current, neighbour, weather, minimum)
            p_low, p_present = runtime.predict(rows)
            outputs.append({"detection_id": detection_id, "cur_code": current["gewog_code"],
                "nbr_code": neighbour["gewog_code"], "nbr_name": neighbour["gewog_name"],
                "p_low": p_low, "p_present": p_present, "risk_label": risk_label(p_present)})
    except FeatureUnavailable as exc:
        raise PredictionUnavailable(str(exc)) from exc
    for output in outputs:
        conn.execute("""INSERT INTO predictions (detection_id, cur_code, nbr_code, nbr_name, p_low, p_present, risk_label)
            VALUES (%(detection_id)s, %(cur_code)s, %(nbr_code)s, %(nbr_name)s, %(p_low)s, %(p_present)s, %(risk_label)s)""", output)
    return conn.execute("SELECT * FROM predictions WHERE detection_id = %s ORDER BY p_present DESC", (detection_id,)).fetchall()
