-- Exactly the three core tables in the handover. No derived features are stored.
CREATE TABLE IF NOT EXISTS gewog_info (
    gewog_code INT PRIMARY KEY,
    gewog_name TEXT NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    centroid_lon DOUBLE PRECISION NOT NULL,
    mean_elevation REAL NOT NULL,
    water_source_count INT NOT NULL,
    neighbour_codes INT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gewog_info_neighbours ON gewog_info USING GIN (neighbour_codes);

CREATE TABLE IF NOT EXISTS sightings (
    detection_id UUID PRIMARY KEY,
    camera_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    gewog_code INT REFERENCES gewog_info(gewog_code),
    species TEXT,
    confidence REAL CHECK (confidence BETWEEN 0 AND 1),
    sight_elev REAL,
    cur_temp REAL,
    cur_hum REAL,
    cur_precip REAL,
    image_path TEXT,
    discarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sightings_ts ON sightings (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sightings_gewog_ts ON sightings (gewog_code, timestamp DESC);

CREATE TABLE IF NOT EXISTS predictions (
    prediction_id BIGSERIAL PRIMARY KEY,
    detection_id UUID NOT NULL REFERENCES sightings(detection_id) ON DELETE CASCADE,
    cur_code INT NOT NULL,
    nbr_code INT NOT NULL REFERENCES gewog_info(gewog_code),
    nbr_name TEXT NOT NULL,
    p_low REAL NOT NULL CHECK (p_low BETWEEN 0 AND 1),
    p_present REAL NOT NULL CHECK (p_present BETWEEN 0 AND 1),
    risk_label TEXT NOT NULL CHECK (risk_label IN ('LOW', 'MEDIUM', 'HIGH')),
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT prediction_probability_sum CHECK (abs(p_low + p_present - 1) < 0.00001)
);
CREATE INDEX IF NOT EXISTS idx_predictions_detection ON predictions (detection_id);
CREATE INDEX IF NOT EXISTS idx_predictions_risk ON predictions (risk_label, predicted_at DESC);
-- Retries must never create a second prediction for the same trigger/neighbour.
CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_pair ON predictions (detection_id, nbr_code);
