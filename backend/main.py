"""Local prototype API. OpenAPI documentation: /docs. No detector is implemented."""
import logging
import os
import asyncio
import hmac
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo
import psycopg
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, FileResponse
from starlette.concurrency import run_in_threadpool
from .db import connect
from .init_db import initialize
from .models import IngestRequest, DetectionResult, ObservationRequest, require_aware
from .ingestion import ingest, complete_detection, get_sighting, with_gewog
from .enrichment import enrich
from .inference import prediction_status
from .tft_runtime import get_runtime
from .features import pair_history
from .uploads import read_limited, store_image, image_file, MAX_IMAGE_BYTES
from .csv_import import import_records, MAX_CSV_BYTES
from . import security, accounts, workflows, delivery

log = logging.getLogger("rikhanet.api")


@asynccontextmanager
async def lifespan(app):
    if os.environ.get("AUTO_INIT_DB", "1") == "1":
        initialize()
    if prediction_status()["status"] in ("ready", "prototype"):
        await run_in_threadpool(get_runtime)
    security.cipher()
    task = asyncio.create_task(delivery.worker(connect))
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="RiKhaNET API", version="0.1.0", lifespan=lifespan)
app.include_router(accounts.router(lambda: connect()))
app.include_router(workflows.router(lambda: connect()))


@app.middleware("http")
async def authenticate(request: Request, call_next):
    try:
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origins = {os.environ.get("APP_ORIGIN", "http://127.0.0.1:3000").rstrip("/"), "http://localhost:3000", "http://127.0.0.1:3000"}
            if request.headers.get("origin") and request.headers["origin"].rstrip("/") not in origins:
                raise HTTPException(403, "Request origin is not allowed")
            if request.headers.get("x-rikhanet-request") != "1":
                raise HTTPException(403, "Missing application request header")
        if request.url.path not in security.PUBLIC:
            def identify():
                with connect() as conn:
                    return security.session_user(conn, request.cookies.get(security.COOKIE))
            user = await run_in_threadpool(identify)
            request.state.user = user
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                if not hmac.compare_digest(security.digest(request.headers.get("x-csrf-token", "")), user["csrf_hash"]):
                    raise HTTPException(403, "Session verification failed. Reload the page")
            admin_paths = ("/imports/", "/ingest", "/settings")
            if request.url.path.startswith(admin_paths) or request.url.path.endswith("/detection"):
                security.require_admin(user)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@app.post("/imports/sightings")
async def import_sightings(request: Request, dry_run: bool = False):
    data = await read_limited(request, MAX_CSV_BYTES)
    def run():
        with connect() as conn:
            return import_records(conn, data, dry_run)
    return await run_in_threadpool(run)


@app.put("/sightings/{detection_id}/image")
async def upload_sighting_image(detection_id: UUID, request: Request):
    data = await read_limited(request, MAX_IMAGE_BYTES)
    def run():
        with connect() as conn:
            security.require_sighting(conn, request.state.user, detection_id)
            return store_image(conn, detection_id, data, request.headers.get("content-type", "").split(";", 1)[0])
    return await run_in_threadpool(run)


@app.get("/sightings/{detection_id}/image")
def sighting_image(detection_id: UUID, request: Request):
    with connect() as conn:
        security.require_sighting(conn, request.state.user, detection_id)
        path, media_type = image_file(conn, detection_id)
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@app.exception_handler(psycopg.Error)
async def database_error(request: Request, error: psycopg.Error):
    log.error("PostgreSQL request failed: %s", type(error).__name__)
    return JSONResponse(status_code=503, content={"detail": "Database unavailable. Check PostgreSQL and run backend.init_db."})


def aware_since(value):
    try:
        if value is None:
            return None
        if len(value) == 10:
            return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=ZoneInfo("Asia/Thimphu"))
        return require_aware(datetime.fromisoformat(value))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/health")
def health():
    with connect() as conn:
        count = conn.execute("SELECT count(*) AS count FROM gewog_info").fetchone()["count"]
    return {"status": "ok", "database": "connected", "gewog_count": count,
            "prediction": prediction_status()}


@app.get("/gewogs")
def gewogs(request: Request):
    with connect() as conn:
        user = request.state.user
        return conn.execute("SELECT * FROM gewog_info WHERE %s OR gewog_code=ANY(%s) ORDER BY gewog_name", (user["role"]=="admin",user["zones"])).fetchall()


@app.post("/ingest", status_code=201)
def ingest_trigger(body: IngestRequest, idempotency_key: Annotated[UUID | None, Header()] = None):
    with connect() as conn:
        return with_gewog(conn, ingest(conn, body, idempotency_key))


@app.patch("/sightings/{detection_id}/detection")
def detection_result(detection_id: UUID, body: DetectionResult):
    with connect() as conn:
        return with_gewog(conn, complete_detection(conn, detection_id, body))


@app.post("/observations", status_code=201)
def observation(body: ObservationRequest, request: Request, idempotency_key: Annotated[UUID | None, Header()] = None):
    """Atomic bridge for existing YOLO output: one accepted frame, one UUID row."""
    with connect() as conn:
        row = ingest(conn, body, idempotency_key)
        if body.expected_gewog_code is not None and row["gewog_code"] != body.expected_gewog_code:
            raise HTTPException(422, "The camera GPS does not match its selected gewog. Correct the camera location before saving this image.")
        security.require_zone(request.state.user, row["gewog_code"])
        result = DetectionResult(species=body.species, confidence=body.confidence, discarded=body.discarded)
        return with_gewog(conn, complete_detection(conn, row["detection_id"], result))


@app.get("/sightings")
def sightings(request: Request, since: str | None = None, gewog_code: int | None = None, before: str | None = None, before_id: UUID | None = None,
              include_discarded: bool = False, limit: int = Query(500, ge=1, le=1000),
              offset: int = Query(0, ge=0)):
    since = aware_since(since)
    before = aware_since(before)
    if before_id is not None and before is None:
        raise HTTPException(422, "before_id requires a before timestamp")
    condition = """WHERE (%(discarded)s OR s.discarded = FALSE)
        AND (%(since)s::timestamptz IS NULL OR s.timestamp >= %(since)s)
        AND (%(before)s::timestamptz IS NULL OR
             (%(before_id)s::uuid IS NULL AND s.timestamp < %(before)s) OR
             (%(before_id)s::uuid IS NOT NULL AND (s.timestamp, s.detection_id) < (%(before)s, %(before_id)s)))
        AND (%(gewog)s::int IS NULL OR s.gewog_code = %(gewog)s)
        AND (%(admin)s OR s.gewog_code=ANY(%(zones)s))"""
    params = {"discarded": include_discarded, "since": since, "before": before, "before_id": before_id, "gewog": gewog_code,
              "limit": limit, "offset": offset, "admin": request.state.user["role"]=="admin", "zones": request.state.user["zones"]}
    with connect() as conn:
        # A single snapshot keeps rows and pagination count consistent with ingestion.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        total = conn.execute("SELECT count(*) AS count FROM sightings s " + condition, params).fetchone()["count"]
        items = conn.execute("SELECT s.*, g.gewog_name, r.status AS review_status, r.flagged, r.note AS review_note FROM sightings s JOIN gewog_info g USING (gewog_code) LEFT JOIN app_reviews r USING(detection_id) " +
                             condition + " ORDER BY s.timestamp DESC, s.detection_id DESC LIMIT %(limit)s OFFSET %(offset)s", params).fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/sightings/{detection_id}")
def sighting(detection_id: UUID, request: Request):
    with connect() as conn:
        security.require_sighting(conn, request.state.user, detection_id)
        return with_gewog(conn, get_sighting(conn, detection_id))


@app.post("/enrich/{detection_id}")
def enrich_trigger(detection_id: UUID, request: Request):
    with connect() as conn:
        security.require_sighting(conn, request.state.user, detection_id)
        result = enrich(conn, detection_id)
        delivery.sync_alerts(conn)
        if request.state.user["role"] != "admin":
            result["predictions"] = [row for row in result.get("predictions", []) if row["nbr_code"] in request.state.user["zones"]]
        return result


@app.get("/predictions")
def predictions(request: Request, since: str | None = None, risk: Literal["LOW", "MEDIUM", "HIGH"] | None = None,
                limit: int = Query(500, ge=1, le=1000), offset: int = Query(0, ge=0)):
    since = aware_since(since)
    params = {"since": since, "risk": risk, "limit": limit, "offset": offset,
              "admin": request.state.user["role"]=="admin", "zones": request.state.user["zones"]}
    with connect() as conn:
        rows = conn.execute("""
            WITH triggers AS (
                SELECT s.* FROM sightings s
                WHERE s.discarded = FALSE
                  AND (%(admin)s OR s.gewog_code=ANY(%(zones)s))
                  AND (%(since)s::timestamptz IS NULL OR s.timestamp >= %(since)s)
                  AND EXISTS (SELECT 1 FROM predictions p WHERE p.detection_id = s.detection_id
                    AND (%(risk)s::text IS NULL OR p.risk_label = %(risk)s))
                ORDER BY s.timestamp DESC, s.detection_id DESC LIMIT %(limit)s OFFSET %(offset)s
            )
            SELECT s.detection_id, s.timestamp, s.camera_id, s.species, s.confidence,
                   s.gewog_code, g.gewog_name, p.prediction_id, p.cur_code, p.nbr_code,
                   p.nbr_name, p.p_low, p.p_present, p.risk_label, p.predicted_at
            FROM triggers s JOIN gewog_info g ON g.gewog_code = s.gewog_code
            JOIN predictions p ON p.detection_id = s.detection_id
            WHERE (%(risk)s::text IS NULL OR p.risk_label = %(risk)s)
              AND (%(admin)s OR p.nbr_code=ANY(%(zones)s))
            ORDER BY s.timestamp DESC, s.detection_id DESC, p.p_present DESC, p.nbr_code
        """, params).fetchall()
    grouped = {}
    for row in rows:
        detection_id = row["detection_id"]
        if detection_id not in grouped:
            grouped[detection_id] = {k: row[k] for k in
                ("detection_id", "timestamp", "camera_id", "species", "confidence", "gewog_code", "gewog_name")}
            grouped[detection_id]["predictions"] = []
        grouped[detection_id]["predictions"].append({k: row[k] for k in
            ("prediction_id", "cur_code", "nbr_code", "nbr_name", "p_low", "p_present", "risk_label", "predicted_at")})
    return list(grouped.values())


@app.get("/predictions/{detection_id}")
def prediction_for_image(detection_id: UUID, request: Request):
    with connect() as conn:
        security.require_sighting(conn, request.state.user, detection_id)
        trigger = with_gewog(conn, get_sighting(conn, detection_id))
        neighbours = conn.execute("SELECT neighbour_codes FROM gewog_info WHERE gewog_code = %s", (trigger["gewog_code"],)).fetchone()["neighbour_codes"]
        rows = [] if trigger["discarded"] else conn.execute("SELECT * FROM predictions WHERE detection_id = %s ORDER BY p_present DESC", (detection_id,)).fetchall()
        history_counts = {code: len(pair_history(conn, trigger["gewog_code"], code, trigger["timestamp"])) for code in neighbours} if not rows and not trigger["discarded"] else {}
    readiness = prediction_status()
    expected = set(neighbours)
    actual = {row["nbr_code"] for row in rows}
    state = "discarded" if trigger["discarded"] else "complete" if rows and actual == expected else "incomplete" if rows else "pending" if readiness["status"] in ("ready", "prototype") else readiness["status"]
    valid_until = trigger["timestamp"] + timedelta(hours=24)
    minimum = get_runtime().min_encoder_length if readiness["status"] in ("ready", "prototype") else None
    missing_history = minimum is not None and any(count < minimum for count in history_counts.values())
    reason = "This detection was discarded." if state == "discarded" else "Saved neighbour predictions for this camera trigger." if state == "complete" else "Stored predictions are incomplete; server reconciliation is required." if state == "incomplete" else readiness["reason"]
    if missing_history:
        reason = f"The model requires at least {minimum} prior elephant events per gewog pair (up to 24). This image has insufficient history for one or more neighbours. Record or import actual earlier sightings before retrying."
    if request.state.user["role"] != "admin":
        rows = [row for row in rows if row["nbr_code"] in request.state.user["zones"]]
        neighbours = [code for code in neighbours if code in request.state.user["zones"]]
        history_counts = {code: count for code,count in history_counts.items() if code in neighbours}
    return {"trigger": trigger, "predictions": rows, "prediction_status": state,
            "expected_neighbours": neighbours, "valid_until": valid_until, "expired": datetime.now(timezone.utc) >= valid_until, "model_status": readiness,
            "history_counts": history_counts, "min_history_events": minimum, "reason": reason}
