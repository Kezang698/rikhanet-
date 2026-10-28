# PostgreSQL, API and TFT prediction — 29 October 2026

The existing Next.js application now defaults to database mode. It reads camera
sightings and prediction results through `/api/backend/*`, which proxies the
FastAPI service. Empty or unavailable databases never fall back to sample data.
The previous browser demonstration remains available with
`NEXT_PUBLIC_DATA_MODE=demo` in `.env.local` and a restarted Next.js server.

## Run locally on Windows

Start Docker Desktop, then run from the repository root:

```powershell
docker compose up -d db
python -m venv backend/.venv
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
backend\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-prediction.txt
backend\.venv\Scripts\python.exe -m backend
```

The API initializes the three core tables and seeds the 17 reference gewogs from
`gewogs_info (1).xlsx`. Repeated startup does not overwrite observations or
reference data. Conflicting reference data produces a startup error for explicit
reconciliation. `AUTO_INIT_DB=0` disables startup initialization;
`python -m backend.init_db` runs initialization separately.

In a second terminal:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1
```

Open [the application](http://localhost:3000) or
[the API documentation](http://127.0.0.1:8000/docs). Existing demo sign-in
credentials apply only in explicit demo mode. In database mode create your first
administrator on `/login`; see [account and workflow setup](ACCOUNTS.md).
A connection banner shows database status and model
readiness. Sightings refresh every 15 seconds while the tab is visible and can
also be refreshed manually.

`START-BACKEND.cmd` starts PostgreSQL and the native API after dependencies are
installed. The existing `START-WINDOWS.cmd` starts the frontend.

Python reads `PG_DSN` and model/weather settings from its environment. Next.js
reads the server-only `RIKHANET_API_URL` (default `http://127.0.0.1:8000`) from
`.env.local`. Python does not automatically read Next.js environment files.

## Containers

```powershell
docker compose up -d --build
```

This starts PostgreSQL and FastAPI. Run Next.js natively as above to retain the
existing host Python/YOLO webcam integration. Install that separate detector's
dependencies using `inference/requirements.txt` as described in the main README.
The API image includes CPU TFT dependencies by default; building it downloads
PyTorch. `WITH_TFT=0` as an API build argument omits them for ingestion-only use.
The native Windows model path has been tested; the updated container image has
not been rebuilt in this revision.

For an entirely containerized dashboard, use:

```powershell
docker compose --profile full up -d --build
```

The optional frontend image serves the dashboard and backend proxy. It does not
bundle the existing native Python YOLO detector; image/webcam inference requires
the native frontend setup for this milestone. Container ports bind to localhost.
The PostgreSQL named volume survives container restarts. Do not remove it to
restart the application.

## API contract

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Database connectivity, reference gewog count, prediction readiness |
| `GET /gewogs` | The 17 reference gewogs and neighbour codes |
| `POST /ingest` | Creates an unprocessed camera trigger with server timestamp and UUID |
| `PATCH /sightings/{id}/detection` | Saves an already-produced external detector result |
| `POST /observations` | Atomically saves a trigger and an existing detector result, used by Webcam |
| `GET /sightings` | Paged stored sightings joined to the current gewog name |
| `GET /sightings/{id}` | One sighting, including detection and environmental fields |
| `PUT /sightings/{id}/image` | Attach an immutable JPEG, PNG or WebP evidence image |
| `GET /sightings/{id}/image` | Retrieve original stored evidence bytes |
| `POST /imports/sightings?dry_run=true` | Validate a CSV and preview five rows without writes |
| `POST /imports/sightings` | Atomically import a CSV; identical-file retries skip existing rows |
| `POST /enrich/{id}` | Enrichment, actual TFT inference and atomic neighbour predictions |
| `GET /predictions` | Grouped stored neighbour predictions, with optional `since` and `risk` filters |
| `GET /predictions/{id}` | Source sighting, only its predictions, completeness, history readiness and expiry |

Ingestion example:

```json
{ "camera_id": "CAM-001", "latitude": 26.92768665, "longitude": 90.51287962 }
```

This resolves to Serzhong (1312) with the supplied original polygons. If both
coordinates are omitted, the unchanged supplied `generate_gmc_point()` helper
generates a synthetic point inside GMC. Supplied coordinates must resolve inside
both GMC and a supported gewog. A single missing coordinate is rejected.

Detection result example:

```json
{ "species": "elephant", "confidence": 0.87, "discarded": false }
```

The API does not run a detector. Repeating the same completed result is safe;
conflicting changes are rejected with 409. This prevents later edits from making
stored predictions inconsistent with the original detection. `/ingest` and
`/observations` accept an optional UUID `Idempotency-Key` header: retain it across
retries of one trigger, and use a fresh key for a new trigger. Reusing it with
different supplied data returns 409. One accepted frame yields one sighting row,
even when that frame contains multiple elephants; confidence is the highest
elephant confidence returned for that event by the existing detector.

Webcam observations include `expected_gewog_code` from the selected camera. With
recorded GPS, the API rejects a location that resolves to a different gewog.
Without GPS, it generates one repeatable sample location per camera inside the
selected gewog's original boundary intersected with GMC. This keeps source images
and neighbour predictions tied to the selected gewog for both roles. The separate
generic ingestion API still permits unrestricted synthetic GMC points when no
camera gewog or GPS is supplied. Old saved triggers retain their original GPS;
run inference again to create a corrected source image and forecast.

`GET /sightings` supports `since`, `gewog_code`, `include_discarded` (false by
default), `limit` (1–1000, default 500), and `offset`. It returns
`{items, total, limit, offset}`. The frontend initially loads the latest 1,000
sightings. **Load older sightings** in the connection banner fetches the next
1,000; automatic refreshes retain older loaded rows. Filters and exports operate
on loaded records. A continuation uses `before` (the oldest loaded timestamp)
and `before_id` (its UUID), which preserves order even with equal timestamps or
new camera arrivals. `before` alone is also supported. `GET /predictions` supports `limit` and
`offset` over whole trigger groups so a page never cuts off some neighbours of a
trigger. It returns only the requested risk tier when `risk` is specified.
`since` accepts a date (Bhutan midnight) or an ISO timestamp with explicit offset.

Enrichment requests elevation at the sighting GPS and forecast-hour weather at
the current gewog centroid, matching the trigger hour in `Asia/Thimphu`.
Missing weather is an error, never an invented zero. Successful enrichment is
reused on retries; failures preserve the original detection and can be retried
from Sightings. Old historical CSV records need a separate historical-weather
import; the live route does not silently use today's weather for them.

## What this milestone does and does not persist

**Camera evidence:** Accepted webcam frames and image detections now save their
original image alongside the sighting. The API uses the existing `image_path`
column and stores files in `uploads/sightings/`, excluded from Git and Docker
builds. Compose mounts `./uploads` as a persistent host folder. Back up this folder
alongside PostgreSQL; a database backup alone does not include image bytes.
`RIKHANET_UPLOAD_DIR` overrides the location for a native API.

The image API takes raw bytes with `Content-Type: image/jpeg`, `image/png`, or
`image/webp`, up to 10 MiB and 25 million pixels. It decodes and validates the
image, rejects animated files, and generates filenames from the detection UUID
and SHA256. A repeat upload of identical bytes is safe; replacing an existing
image with different bytes returns 409. Discarded detections do not expose images.
Images are served through the backend proxy with no caching. If attachment fails,
the saved sighting remains valid and the UI reports the image failure. Existing
sightings without images remain unchanged. No fabricated boxes are drawn on
stored evidence because the three-table schema does not store bounding boxes.

**CSV import:** In **Data Review**, choose or paste a UTF-8 CSV, use **Validate
CSV** to preview, then choose **Import**. The blank downloadable template lists
`species,date,time,zone,camera,confidence,latitude,longitude`; optional
`detection_id` accepts UUIDs from an external system. Dates are `YYYY-MM-DD`,
times are `HH:MM` in Bhutan time, and gewogs accept names or codes. Real GPS is
required and checked against the supplied original polygons and GMC boundary.
No random coordinates are generated for imported observations.

Each file is limited to 2 MB and 1,000 rows. Every row is validated before writes;
any invalid row or conflicting detection UUID rolls the entire import back.
Without explicit UUIDs, a file hash and row number generate deterministic IDs:
re-uploading identical bytes skips existing rows. A modified/reordered file is a
different import, so supply stable UUIDs when records may recur across files.
Imported timestamps are preserved; weather and predictions remain empty until
separately supplied or processed. The schema does not record observation source,
so database rows are labeled **Stored observation** instead of claiming that all
imported rows came from camera traps. Historical imports are visible in Sightings
without the old demonstration date filter. New species also appear in filters.

The core model tables are `gewog_info`, `sightings`, and `predictions`. The new
account/workflow milestone adds `app_*` tables through `workflows.sql`. Sightings
contain exactly the handover columns. Prediction probabilities have range/sum
checks, and a unique trigger/neighbour index prevents duplicate prediction rows.
No derived features, per-sighting neighbours, or seasonal/GPS model features have
been added to the schema.

Sightings, overview counts, map markers, and reports read stored observations.
Predictions and map colours read stored probabilities and the backend risk label;
there are no fallback demo forecasts. The forecast view shows the latest result
per neighbour within the trigger's 24-hour horizon. Missing forecasts are grey.
Stored observations without an image show a placeholder instead of demo wildlife
photographs or made-up bounding boxes.

Camera configurations remain a browser feature. Ranger accounts, assignments,
profiles, preferences, application settings, review notes/decisions, field reports,
alerts and responses now persist in the new application tables. Existing browser
demo data is kept under its original storage key
and is never automatically imported into PostgreSQL. The 293,189-row research CSV
has not been imported into the live sighting stream.

**This is a local development API.** Database mode now requires hashed-password
accounts, revocable cookie sessions and server-side role/gewog authorization.
The full account setup, 2FA, recovery and deployment settings are documented in
[ACCOUNTS.md](ACCOUNTS.md). Keep services bound to localhost during this phase.

## TFT predictions and image maps

The supplied binary `rikhanet_tft_binary.ckpt` now runs on CPU. The runtime
loads the original weights directly, recovers fitted encoders and scalers from
the checkpoint's saved `dataset_parameters`, and never retrains or refits them.
An original `models/training_dataset.pkl` can also supply these parameters if
provided later. Loading is once per API process. A fresh CrossEntropy loss and
default metrics remove stale CUDA device flags from the saved metric objects.
The environment pins scikit-learn 1.6.1 and Lightning 2.6.6 to their saved versions.

Each source/neighbor pair uses up to 24 actual prior elephant events and the
current trigger as its decoder row. The checkpoint's saved minimum is 4 encoder
events. Fewer than four prior events for any pair leaves the prediction pending;
the API never duplicates the current image to pad history. Each event gets its
own timestamp, elevation, distance and strictly earlier 6/12/24-hour counts.
Neighbour and historical centroid weather is fetched in one batch. Missing
elevation/weather or unsupported history prevents prediction with a reason.
Raw sighting GPS and day-of-year are excluded from model inputs. Features remain
transient and do not add database columns.

Both classes are produced by softmax over the model's two logits: `p_low` is
absence and `p_present` is occurrence. `backend/inference.py` applies the shared
thresholds: LOW below 25%, MEDIUM from 25% to below 60%, HIGH from 60% upward.
Every neighbour succeeds before any prediction rows are inserted. A failure
retains valid source evidence and weather; retry reuses complete stored results.

**Reference parity is pending.** The supplied root `tft_test_predictions.csv`
contains `p_low,p_medium,p_high`, a three-class export. It cannot validate this
binary checkpoint and is never converted into binary probabilities. With the
current artifacts the health endpoint reports `prototype`, and the UI labels
the actual TFT output accordingly. The training notebook is unavailable, so the
feature reconstruction follows the handover and checkpoint contract without a
claim of equality to the original training pipeline. Training on non-Bhutanese
data and synthetic laptop-camera locations also limit operational use.

If matching binary references and known feature windows become available:

```powershell
# CSV requires reference_id,p_present exported independently from training.
# JSON: [{"reference_id":"sample-1","rows":[...encoder rows..., ...trigger row...]}]
backend\.venv\Scripts\python.exe -m backend.validate_prediction --inputs known_windows.json
```

This compares supplied feature windows against the reference within 1e-5 and
writes `models/prediction_validation.json`. It does not validate reconstruction
from raw events; that requires matching training inputs too. Readiness verifies
the report's artifact, code and dependency fingerprints. No passing report is
included or generated from the model's own output.

After Webcam saves an accepted image, **View prediction on map** (or **View
prediction status**) links to `/admin/predictions?detection=<uuid>` or the ranger
equivalent. The source evidence and camera marker stay tied to that UUID. Only
its neighbour predictions colour the map: blue/yellow/red for LOW/MEDIUM/HIGH,
grey for no forecast, with a green outline around the source gewog. An empty
result never falls back to another image's forecasts. Saved expired results are
explicitly historical. The general Predictions page and Wildlife Map's
**Prediction colours** overlay use the latest valid results per neighbour.
All shared maps, including Overview, Cameras and Zones, now enable the current
risk overlay in database mode. The Layers panel can toggle it. Gewogs show risk
through coloured fills; tapping a gewog opens its prediction details. Permanent
information boxes are hidden. The legend uses a red warning triangle (HIGH),
yellow diamond (MEDIUM) and blue check circle (LOW). Grey indicates no stored
forecast and is explained below the map.
Ranger webhook delivery is implemented through the encrypted durable outbox;
its destination and SMTP credentials are intentionally awaiting configuration.

The supplied root `test_gewog.py` is preserved. It reads an absent GeoJSON at
import time and has no `find_gewog()` function. The callable adapter in
`backend/helpers/gewog_lookup.py` uses the archive's original shapefiles, checks
the GMC boundary, and deterministically handles shared polygon boundaries.
The original point generator and its data files were copied without modification.

## Verification

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd run typecheck
npm.cmd run build
```

The integration tests create and remove only randomly named
`rikhanet_test_<uuid>` schemas in the configured database. They verify exact
columns, repeatable seeding, coordinate validation, null ingestion fields,
atomic/idempotent observation saves, immutable detection completion, discarded
gating, enrichment failure/retry behavior, joined prediction filters/paging,
evidence upload/retrieval/overwrite protection, CSV preview and atomic imports,
identical-file retries, conflicting UUID rollback, and cursor continuation.
Weather response behavior is tested with a controlled HTTP transport; no test
forecasts or sightings are left in the application's public schema. Test images
use temporary folders. The core suite passes 41 backend tests, including actual
CPU model inference through enrichment, database storage and image retrieval
with controlled test history/weather. Separate 4-event and 24-event CPU forward
checks preserve fitted parameters and return deterministic probabilities. These
checks are engineering verification, not reference parity. TypeScript checks and
the production build also pass. Local HTTP checks verify the Next.js CSV preview/error routes,
binary-image forwarding, and cursor query forwarding. Browser automation was
disabled in Work settings, so this revision has no new visual browser verification.

The account/workflow suite adds 11 passing tests for authentication, CSRF,
assignment isolation, suspension, review history, report persistence, alert
deduplication/responses, password recovery, session revocation, TOTP recovery,
settings, signed webhook retries/expiry and SMTP delivery with controlled mocks.

Implementation references: [Psycopg transactions](https://www.psycopg.org/psycopg3/docs/basic/transactions.html),
[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), and
[Open-Meteo forecast parameters](https://open-meteo.com/en/docs).
