"""Integration tests use an isolated, randomly named PostgreSQL schema.

No user sightings are imported, truncated, or deleted. Run from the repository:
    backend/.venv/Scripts/python.exe -m pytest backend/tests -q
"""
import math
from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import UUID, uuid4
import httpx
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import pytest
from fastapi.testclient import TestClient
from backend import config, main, init_db, enrichment, inference, features, tft_runtime, delivery, security
from backend.inference import risk_label
from backend.seed_gewog_info import read_gewogs
from PIL import Image


@pytest.fixture
def database(monkeypatch):
    schema = "rikhanet_test_" + uuid4().hex
    try:
        admin = psycopg.connect(config.PG_DSN, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError as exc:
        pytest.fail(f"Integration tests require PostgreSQL (docker compose up -d db): {type(exc).__name__}")
    admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

    def connect():
        return psycopg.connect(config.PG_DSN, row_factory=dict_row,
            options=f"-c search_path={schema} -c timezone=UTC -c statement_timeout=15000")

    monkeypatch.setattr(main, "connect", connect)
    monkeypatch.setattr(init_db, "connect", connect)
    async def no_worker(connect):
        return
    monkeypatch.setattr(delivery, "worker", no_worker)
    try:
        init_db.initialize()
        yield connect
    finally:
        # schema is generated above and quoted as an identifier, never user input.
        admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        admin.close()


@pytest.fixture
def client(database):
    with TestClient(main.app) as client:
        client.headers["X-Rikhanet-Request"]="1"
        response=client.post("/auth/setup",json={"name":"Test Admin","email":"admin@test.bt","password":"TestPassword-2026"})
        assert response.status_code==200,response.text
        client.headers["X-CSRF-Token"]=client.cookies.get("rikhanet_csrf")
        yield client


def trigger(client, **changes):
    body = {"camera_id": "CAM-TEST", "latitude": 26.92768665, "longitude": 90.51287962}
    body.update(changes)
    result = client.post("/ingest", json=body)
    assert result.status_code == 201, result.text
    return result.json()


def test_exact_schema_and_seed(client, database):
    assert client.get("/health").json()["gewog_count"] == 17
    assert len(client.get("/gewogs").json()) == 17
    with database() as conn:
        columns = conn.execute("""SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name IN ('sightings','gewog_info','predictions') ORDER BY ordinal_position""").fetchall()
    actual = {}
    for row in columns:
        actual.setdefault(row["table_name"], []).append(row["column_name"])
    assert actual == {
        "gewog_info": ["gewog_code", "gewog_name", "centroid_lat", "centroid_lon", "mean_elevation", "water_source_count", "neighbour_codes"],
        "sightings": ["detection_id", "camera_id", "timestamp", "latitude", "longitude", "gewog_code", "species", "confidence", "sight_elev", "cur_temp", "cur_hum", "cur_precip", "image_path", "discarded", "created_at"],
        "predictions": ["prediction_id", "detection_id", "cur_code", "nbr_code", "nbr_name", "p_low", "p_present", "risk_label", "predicted_at"],
    }
    assert init_db.initialize() == 0  # repeat initialization preserves existing rows


def test_ingest_and_coordinate_validation(client):
    row = trigger(client)
    assert UUID(row["detection_id"])
    assert row["gewog_code"] == 1312
    assert all(row[field] is None for field in ("species", "confidence", "sight_elev", "cur_temp", "cur_hum", "cur_precip"))
    assert client.get(f"/sightings/{row['detection_id']}").json()["camera_id"] == "CAM-TEST"
    assert client.post("/ingest", json={"latitude": 26.9}).status_code == 422
    assert client.post("/ingest", json={"latitude": 0, "longitude": 0}).status_code == 422
    assert client.post("/ingest", json={"camera_id": "  "}).status_code == 422
    assert client.post("/ingest", json={"gewog_code": 1312}).status_code == 422
    synthetic = client.post("/ingest", json={"camera_id": "CAM-SYNTHETIC"})
    assert synthetic.status_code == 201, synthetic.text
    assert synthetic.json()["gewog_code"] in {r["gewog_code"] for r in read_gewogs(config.GEWOG_SEED_PATH)}


def test_idempotent_observations_and_detection_results(client):
    body = {"camera_id": "CAM-001", "species": "elephant", "confidence": .87}
    headers = {"Idempotency-Key": str(uuid4())}
    first = client.post("/observations", json=body, headers=headers)
    retry = client.post("/observations", json=body, headers=headers)
    assert first.status_code == retry.status_code == 201
    assert first.json()["detection_id"] == retry.json()["detection_id"]
    assert client.get("/sightings").json()["total"] == 1
    assert client.post("/observations", json={**body, "camera_id": "OTHER"}, headers=headers).status_code == 409
    assert client.post("/observations", json={**body, "confidence": .99}, headers=headers).status_code == 409
    row = trigger(client)
    path = f"/sightings/{row['detection_id']}/detection"
    result = {"species": "elephant", "confidence": .87, "discarded": False}
    assert client.patch(path, json=result).status_code == 200
    assert client.patch(path, json=result).status_code == 200
    assert client.patch(path, json={**result, "confidence": 2}).status_code == 422
    assert client.patch(path, json={**result, "discarded": True}).status_code == 409


def test_gate_enrichment_and_retries(client, monkeypatch, database):
    row = trigger(client)
    path = f"/enrich/{row['detection_id']}"
    assert client.post(path).status_code == 409
    client.patch(f"/sightings/{row['detection_id']}/detection", json={"species": "elephant", "confidence": .9})
    calls = []

    def weather(sighting, gewog):
        calls.append((sighting, gewog))
        assert gewog["gewog_code"] == 1312
        return {"sight_elev": 320.4, "cur_temp": 24.1, "cur_hum": 82, "cur_precip": 0.0}

    monkeypatch.setattr(enrichment, "fetch_environment", weather)
    result = client.post(path)
    assert result.status_code == 200, result.text
    assert result.json()["prediction_status"] == "unavailable"
    assert result.json()["predictions"] == []
    assert result.json()["cur_precip"] == 0
    assert client.post(path).status_code == 200
    assert len(calls) == 1
    saved = client.get(f"/sightings/{row['detection_id']}").json()
    assert saved["cur_temp"] == pytest.approx(24.1)
    discarded = trigger(client)
    client.patch(f"/sightings/{discarded['detection_id']}/detection", json={"species": "elephant", "confidence": .2, "discarded": True})
    assert client.post(f"/enrich/{discarded['detection_id']}").json() == {"skipped": "discarded"}
    assert len(calls) == 1
    with database() as conn:
        assert conn.execute("SELECT count(*) AS n FROM predictions").fetchone()["n"] == 0


def test_failed_weather_rolls_back_and_can_retry(client, monkeypatch):
    row = client.post("/observations", json={"species": "elephant", "confidence": .9}).json()

    def failed(sighting, gewog):
        from fastapi import HTTPException
        raise HTTPException(502, "Weather unavailable")

    monkeypatch.setattr(enrichment, "fetch_environment", failed)
    assert client.post(f"/enrich/{row['detection_id']}").status_code == 502
    saved = client.get(f"/sightings/{row['detection_id']}").json()
    assert saved["species"] == "elephant" and saved["cur_temp"] is None


def test_prediction_join_filter_paging_and_discard_gate(client, database):
    row = trigger(client)
    with database() as conn:
        for code, name, probability in [(1302, "Chhuzangang", .81), (1306, "Gelephu", .1)]:
            conn.execute("""INSERT INTO predictions (detection_id, cur_code, nbr_code, nbr_name, p_low, p_present, risk_label)
                VALUES (%s, 1312, %s, %s, %s, %s, %s)""",
                (row["detection_id"], code, name, 1-probability, probability, risk_label(probability)))
    groups = client.get("/predictions?risk=HIGH").json()
    assert len(groups) == 1 and groups[0]["gewog_name"] == "Serzhong"
    assert len(groups[0]["predictions"]) == 1
    assert groups[0]["predictions"][0]["nbr_code"] == 1302
    assert len(client.get("/predictions?limit=1").json()[0]["predictions"]) == 2
    assert client.get("/predictions?offset=1").json() == []
    assert client.get("/predictions?risk=INVALID").status_code == 422
    assert client.get("/predictions?since=2026-10-28").status_code == 200
    assert client.get("/predictions?since=2026-10-28T00:00:00").status_code == 422
    assert client.get("/predictions?since=2099-01-01T00:00:00Z").json() == []
    assert client.get("/sightings?limit=0").status_code == 422
    assert client.get("/sightings?offset=1").json()["items"] == []
    with database() as conn:
        conn.execute("UPDATE sightings SET discarded = TRUE WHERE detection_id = %s", (row["detection_id"],))
    assert client.get("/predictions").json() == []
    assert client.get("/sightings").json()["total"] == 0
    assert client.get("/sightings?include_discarded=true").json()["total"] == 1


def test_weather_uses_trigger_hour_and_centroid(monkeypatch):
    from datetime import datetime, timezone
    calls = []

    def handler(request):
        calls.append(request)
        if "elevation" in request.url.path:
            return httpx.Response(200, json={"elevation": [320.4]})
        hour = request.url.params["start_hour"]
        return httpx.Response(200, json={"hourly": {"time": [hour], "temperature_2m": [24.1],
            "relative_humidity_2m": [82], "precipitation": [0]}})

    original = httpx.Client
    monkeypatch.setattr(enrichment.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    result = enrichment.fetch_environment({"timestamp": datetime.now(timezone.utc), "latitude": 26.92, "longitude": 90.51},
        {"centroid_lat": 26.92891, "centroid_lon": 90.5622})
    assert result["cur_precip"] == 0
    assert calls[0].url.params["latitude"] == "26.92"
    assert calls[1].url.params["latitude"] == "26.92891"
    assert calls[1].url.params["start_hour"] == calls[1].url.params["end_hour"]
    assert calls[1].url.params["timezone"] == "Asia/Thimphu"


def test_database_outage_is_explicit(monkeypatch):
    def offline():
        raise psycopg.OperationalError("private connection details")
    monkeypatch.setattr(main, "connect", offline)
    response = TestClient(main.app).get("/health")
    assert response.status_code == 503
    assert "Database unavailable" in response.json()["detail"]
    assert "private" not in response.text


def png_bytes(color="white"):
    data = BytesIO()
    Image.new("RGB", (100, 80), color).save(data, format="PNG")
    return data.getvalue()


def test_image_roundtrip_immutable_and_validated(client, database, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path)
    row = trigger(client)
    path = f"/sightings/{row['detection_id']}/image"
    assert client.get(path).status_code == 404
    data = png_bytes()
    headers = {"Content-Type": "image/png"}
    assert client.put(path, content=data, headers=headers).status_code == 200
    assert client.put(path, content=data, headers=headers).status_code == 200
    assert client.put(path, content=png_bytes("black"), headers=headers).status_code == 409
    response = client.get(path)
    assert response.status_code == 200 and response.content == data
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]
    saved = client.get(f"/sightings/{row['detection_id']}").json()
    assert saved["image_path"].startswith(row["detection_id"])
    assert len(list(tmp_path.iterdir())) == 1
    other = trigger(client)
    other_path = f"/sightings/{other['detection_id']}/image"
    assert client.put(other_path, content=data, headers={"Content-Type": "image/jpeg"}).status_code == 415
    assert client.put(other_path, content=b"not-an-image", headers=headers).status_code == 422
    assert client.put(other_path, content=data, headers={"Content-Type": "image/svg+xml"}).status_code == 415
    assert client.put(other_path, content=b"", headers=headers).status_code == 400
    assert client.put(other_path, content=b"x", headers={**headers, "Content-Length": str(11 * 1024 * 1024)}).status_code == 413
    with database() as conn:
        conn.execute("UPDATE sightings SET image_path = '../../best.pt' WHERE detection_id = %s", (row["detection_id"],))
    assert client.get(path).status_code == 404


def test_discarded_image_is_not_exposed(client, database, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path)
    row = trigger(client)
    path = f"/sightings/{row['detection_id']}/image"
    with database() as conn:
        conn.execute("UPDATE sightings SET discarded = TRUE WHERE detection_id = %s", (row["detection_id"],))
    assert client.put(path, content=png_bytes(), headers={"Content-Type": "image/png"}).status_code == 409
    assert client.get(path).status_code == 404
    assert not list(tmp_path.iterdir())


CSV_HEADER = "species,date,time,zone,camera,confidence,latitude,longitude"
CSV_ROW = "elephant,2025-01-02,06:30,Serzhong,CAM-CSV,0.87,26.92768665,90.51287962"


def csv_request(client, text, preview=False):
    return client.post("/imports/sightings" + ("?dry_run=true" if preview else ""),
                       content=text.encode("utf-8"), headers={"Content-Type": "text/csv"})


def test_csv_preview_commit_retry_and_timestamp(client):
    text = CSV_HEADER + "\n" + CSV_ROW + "\n"
    response = csv_request(client, text, preview=True)
    assert response.status_code == 200, response.text
    assert response.json()["new_rows"] == 1 and response.json()["imported"] == 0
    assert client.get("/sightings").json()["total"] == 0
    imported = csv_request(client, text)
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported"] == 1
    duplicate = csv_request(client, text)
    assert duplicate.json()["imported"] == 0 and duplicate.json()["skipped"] == 1
    row = client.get("/sightings").json()["items"][0]
    assert row["timestamp"].startswith("2025-01-02T00:30:00")
    assert row["gewog_code"] == 1312 and row["cur_temp"] is None


@pytest.mark.parametrize("bad_row", [
    CSV_ROW.replace("Serzhong", "Gelephu"), CSV_ROW.replace("0.87", "nan"),
    CSV_ROW.replace("2025-01-02", "2025-02-30"), CSV_ROW.replace("06:30", "6:30"),
    CSV_ROW.replace("2025-01-02", "2099-01-02"), CSV_ROW.replace("26.92768665", "0"),
    CSV_ROW.replace("CAM-CSV", ""), CSV_ROW + ",extra",
    CSV_ROW.replace("elephant", "elephant\x00"),
])
def test_csv_invalid_row_rejects_whole_file(client, bad_row):
    response = csv_request(client, CSV_HEADER + "\n" + CSV_ROW + "\n" + bad_row)
    assert response.status_code == 422, response.text
    assert client.get("/sightings").json()["total"] == 0


def test_csv_existing_uuid_conflict_rolls_back(client):
    existing_id = "ffffffff-ffff-4fff-bfff-ffffffffffff"
    first = csv_request(client, CSV_HEADER + ",detection_id\n" + CSV_ROW + "," + existing_id)
    assert first.status_code == 200
    lower_id = "00000000-0000-4000-8000-000000000001"
    conflict = CSV_ROW.replace("0.87", "0.95")
    response = csv_request(client, CSV_HEADER + ",detection_id\n" + CSV_ROW + "," + lower_id + "\n" + conflict + "," + existing_id)
    assert response.status_code == 409
    assert client.get("/sightings").json()["total"] == 1
    assert client.get(f"/sightings/{lower_id}").status_code == 404


def test_cursor_pagination_same_timestamp_and_concurrent_insert(client, database):
    ids = [trigger(client)["detection_id"] for _ in range(3)]
    with database() as conn:
        conn.execute("UPDATE sightings SET timestamp = '2025-01-02T00:00:00Z'")
    first = client.get("/sightings?limit=1").json()["items"][0]
    trigger(client)  # a newer insert must not shift the continuation cursor
    second = client.get("/sightings", params={"limit": 10, "before": first["timestamp"], "before_id": first["detection_id"]})
    assert second.status_code == 200, second.text
    remaining = second.json()["items"]
    assert len(remaining) == 2
    assert {first["detection_id"], *(row["detection_id"] for row in remaining)} == set(ids)
    assert client.get("/sightings", params={"before_id": ids[0]}).status_code == 422


def add_predictions(conn, detection_id, probability=.7):
    for code, name in [(1302, "Chhuzangang"), (1306, "Gelephu"), (1308, "Jigmechhoeling"), (1315, "Umling")]:
        conn.execute("""INSERT INTO predictions (detection_id, cur_code, nbr_code, nbr_name, p_low, p_present, risk_label)
            VALUES (%s, 1312, %s, %s, %s, %s, %s)""", (detection_id, code, name, 1-probability, probability, risk_label(probability)))


def test_image_prediction_endpoint_is_scoped_to_trigger(client, database):
    first, second = trigger(client), trigger(client)
    with database() as conn:
        add_predictions(conn, first["detection_id"], .7)
        add_predictions(conn, second["detection_id"], .2)
    focused = client.get(f"/predictions/{first['detection_id']}")
    assert focused.status_code == 200, focused.text
    result = focused.json()
    assert result["trigger"]["detection_id"] == first["detection_id"]
    assert result["prediction_status"] == "complete"
    assert len(result["predictions"]) == 4
    assert all(row["detection_id"] == first["detection_id"] and row["risk_label"] == "HIGH" for row in result["predictions"])
    assert set(result["expected_neighbours"]) == {1302, 1306, 1308, 1315}
    assert result["expired"] is False
    with database() as conn:
        conn.execute("UPDATE sightings SET timestamp = timestamp - interval '2 days' WHERE detection_id = %s", (first["detection_id"],))
    assert client.get(f"/predictions/{first['detection_id']}").json()["expired"] is True
    assert client.get(f"/predictions/{uuid4()}").status_code == 404


def test_image_prediction_missing_and_discarded_status(client, database):
    row = trigger(client)
    result = client.get(f"/predictions/{row['detection_id']}").json()
    assert result["prediction_status"] in ("unavailable", "pending") and result["predictions"] == []
    with database() as conn:
        conn.execute("UPDATE sightings SET discarded = TRUE WHERE detection_id = %s", (row["detection_id"],))
    assert client.get(f"/predictions/{row['detection_id']}").json()["prediction_status"] == "discarded"


def test_temporal_counts_exclude_future_discarded_and_other_species(client, database):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    with database() as conn:
        for hours, species, discarded in [(1, "elephant", False), (8, "elephant", False), (20, "elephant", False),
                (30, "elephant", False), (-1, "elephant", False), (0, "elephant", False), (2, "Wild Boar", False), (2, "elephant", True)]:
            conn.execute("""INSERT INTO sightings (detection_id, camera_id, timestamp, gewog_code, species, confidence, discarded)
                VALUES (%s, 'TEST', %s, 1312, %s, .9, %s)""", (uuid4(), now-timedelta(hours=hours), species, discarded))
        window = features.window_features(conn, 1312, now)
        assert window == {"cnt_6h": 1, "cnt_12h": 2, "cnt_24h": 3, "since_h": 1, "no_prev": 0}
        empty = features.window_features(conn, 1302, now)
        assert empty["since_h"] == 168 and empty["no_prev"] == 1


def test_feature_history_is_reconstructed_and_not_current_row_repeated(client, database):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    trigger_id = uuid4()
    with database() as conn:
        for index in range(25):
            event_id = trigger_id if index == 24 else uuid4()
            conn.execute("""INSERT INTO sightings (detection_id, camera_id, timestamp, gewog_code, species, confidence,
                latitude, longitude, sight_elev, cur_temp, cur_hum, cur_precip)
                VALUES (%s, 'TEST', %s, 1312, 'elephant', .9, 26.927, 90.512, %s, %s, 80, 0)""",
                (event_id, now-timedelta(hours=24-index), 300+index, 20+index))
        event = conn.execute("SELECT * FROM sightings WHERE detection_id = %s", (trigger_id,)).fetchone()
        current = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = 1312").fetchone()
        neighbour = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = 1302").fetchone()
        weather = lambda gewog, ts: {"temp": 25, "hum": 81, "precip": 0}
        rows = features.build_pair_rows(conn, event, current, neighbour, weather)
        assert len(rows) == 25 and [row["time_idx"] for row in rows] == list(range(25))
        assert rows[0]["sight_elev"] == 300 and rows[-1]["sight_elev"] == 324
        assert rows[0]["cur_temp"] == 20 and rows[-1]["cur_temp"] == 44
        assert rows[0]["cur_cnt_24h"] == 0 and rows[-1]["cur_cnt_24h"] == pytest.approx(math.log1p(24))
        assert all(row["pair"] == "1312_1302" for row in rows)
        assert not set(rows[0]) & {"latitude", "longitude", "sight_lat", "sight_lon", "day_of_year", "doy_sin", "doy_cos"}


def test_inference_all_neighbours_and_retry_are_atomic(client, database, monkeypatch):
    monkeypatch.setattr(inference, "prediction_status", lambda: {"status": "ready"})
    fake_runtime = type("Runtime", (), {"predict": lambda self, rows: (.3, .7)})()
    monkeypatch.setattr(inference, "get_runtime", lambda: fake_runtime)
    monkeypatch.setattr(inference, "build_pair_rows", lambda *args: [{}] * 25)
    monkeypatch.setattr(inference, "pair_history", lambda *args: [{"timestamp": datetime.now(timezone.utc)}] * 24)
    monkeypatch.setattr(enrichment, "fetch_environment", lambda *args: {"sight_elev": 300, "cur_temp": 22, "cur_hum": 80, "cur_precip": 0})
    row = client.post("/observations", json={"species": "elephant", "confidence": .9,
        "latitude": 26.92768665, "longitude": 90.51287962}).json()
    response = client.post(f"/enrich/{row['detection_id']}")
    assert response.status_code == 200, response.text
    assert response.json()["prediction_status"] == "complete" and len(response.json()["predictions"]) == 4
    assert client.post(f"/enrich/{row['detection_id']}").json()["prediction_status"] == "complete"
    with database() as conn:
        assert conn.execute("SELECT count(*) AS n FROM predictions").fetchone()["n"] == 4


def test_model_failure_preserves_weather_without_partial_predictions(client, database, monkeypatch):
    calls = []
    def predict(rows):
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError("Controlled model failure")
        return (.3, .7)
    monkeypatch.setattr(inference, "prediction_status", lambda: {"status": "ready"})
    fake = type("Runtime", (), {})()
    fake.predict = predict
    monkeypatch.setattr(inference, "get_runtime", lambda: fake)
    monkeypatch.setattr(inference, "build_pair_rows", lambda *args: [{}] * 25)
    monkeypatch.setattr(inference, "pair_history", lambda *args: [{"timestamp": datetime.now(timezone.utc)}] * 24)
    monkeypatch.setattr(enrichment, "fetch_environment", lambda *args: {"sight_elev": 300, "cur_temp": 22, "cur_hum": 80, "cur_precip": 0})
    row = client.post("/observations", json={"species": "elephant", "confidence": .9,
        "latitude": 26.92768665, "longitude": 90.51287962}).json()
    result = client.post(f"/enrich/{row['detection_id']}").json()
    assert result["prediction_status"] == "error"
    with database() as conn:
        assert conn.execute("SELECT count(*) AS n FROM predictions").fetchone()["n"] == 0
        assert conn.execute("SELECT cur_temp FROM sightings WHERE detection_id = %s", (row["detection_id"],)).fetchone()["cur_temp"] == 22


def test_missing_history_does_not_fabricate_rows(client, database):
    row = trigger(client)
    with database() as conn:
        event = conn.execute("SELECT * FROM sightings WHERE detection_id = %s", (row["detection_id"],)).fetchone()
        current = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = 1312").fetchone()
        neighbour = conn.execute("SELECT * FROM gewog_info WHERE gewog_code = 1302").fetchone()
        with pytest.raises(features.FeatureUnavailable, match="at least 24"):
            features.build_pair_rows(conn, event, current, neighbour, lambda *args: {})


def test_real_cpu_tft_through_enrichment_and_image_endpoint(client, database, monkeypatch):
    """Exercise the supplied model, real feature builder and DB in a disposable schema.

    Controlled test weather and history are engineering fixtures, not parity data.
    """
    if tft_runtime.readiness()["status"] not in ("ready", "prototype"):
        pytest.skip("Install requirements-prediction.txt and supply the checkpoint for this integration test")
    runtime = tft_runtime.get_runtime()
    count = runtime.min_encoder_length
    now = datetime.now(timezone.utc)
    with database() as conn:
        for index in range(count):
            conn.execute("""INSERT INTO sightings (detection_id, camera_id, timestamp, gewog_code, species, confidence,
                latitude, longitude, sight_elev, cur_temp, cur_hum, cur_precip)
                VALUES (%s, 'TFT-TEST', %s, 1312, 'elephant', .9, 26.92768665, 90.51287962, %s, %s, 80, 0)""",
                (uuid4(), now-timedelta(hours=count-index), 300+index, 22+index))
    monkeypatch.setattr(enrichment, "fetch_environment", lambda *args: {"sight_elev": 305, "cur_temp": 25, "cur_hum": 80, "cur_precip": 0})
    calls = []

    def weather(gewogs, start, end):
        from zoneinfo import ZoneInfo
        calls.append(len(gewogs))
        cache = {}
        hour = start.astimezone(ZoneInfo(config.TIMEZONE)).replace(minute=0, second=0, microsecond=0)
        while hour <= end.astimezone(ZoneInfo(config.TIMEZONE)):
            for gewog in gewogs:
                cache[(gewog["gewog_code"], hour.strftime("%Y-%m-%dT%H:00"))] = {"temp": 24, "hum": 81, "precip": 0}
            hour += timedelta(hours=1)
        return cache

    monkeypatch.setattr(enrichment, "fetch_weather_batch", weather)
    row = client.post("/observations", json={"species": "elephant", "confidence": .91,
        "latitude": 26.92768665, "longitude": 90.51287962}).json()
    response = client.post(f"/enrich/{row['detection_id']}")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["prediction_status"] == "complete", result
    assert calls == [5]  # One batch for the source centroid and its four neighbours.
    assert len(result["predictions"]) == 4
    for prediction in result["predictions"]:
        assert math.isfinite(prediction["p_present"])
        assert prediction["p_low"] + prediction["p_present"] == pytest.approx(1, abs=1e-6)
        assert prediction["risk_label"] == risk_label(prediction["p_present"])
    focused = client.get(f"/predictions/{row['detection_id']}").json()
    assert focused["prediction_status"] == "complete"
    assert focused["predictions"] == result["predictions"]
    retry = client.post(f"/enrich/{row['detection_id']}").json()
    assert retry["predictions"] == result["predictions"] and calls == [5]
    with database() as conn:
        assert conn.execute("SELECT count(*) AS n FROM predictions").fetchone()["n"] == 4


@pytest.mark.parametrize("probability,label", [(0, "LOW"), (.24, "LOW"), (.25, "MEDIUM"), (.3, "MEDIUM"), (.6, "HIGH"), (.61, "HIGH"), (1, "HIGH")])
def test_risk_boundaries(probability, label):
    assert risk_label(probability) == label


@pytest.mark.parametrize("probability", [-.1, 1.1, math.nan, math.inf])
def test_invalid_probabilities(probability):
    with pytest.raises(ValueError):
        risk_label(probability)
