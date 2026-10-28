-- Additive application workflows; the three original model tables are unchanged.
CREATE TABLE IF NOT EXISTS app_users (
 id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','ranger')),
 active BOOLEAN NOT NULL DEFAULT TRUE, phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 preferences JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login TIMESTAMPTZ,
 mfa_secret TEXT, mfa_pending TEXT, mfa_pending_at TIMESTAMPTZ, mfa_counter BIGINT NOT NULL DEFAULT -1,
 recovery_hashes JSONB NOT NULL DEFAULT '[]', failed_attempts INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS app_assignments (
 user_id UUID REFERENCES app_users(id) ON DELETE CASCADE, gewog_code INT REFERENCES gewog_info(gewog_code),
 PRIMARY KEY(user_id, gewog_code)
);
CREATE TABLE IF NOT EXISTS app_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 csrf_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_password_resets (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS app_rate_limits (
 key TEXT PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), attempts INT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS app_reviews (
 detection_id UUID PRIMARY KEY REFERENCES sightings(detection_id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('Needs review','Approved','Rejected','Automatically saved')),
 flagged BOOLEAN NOT NULL DEFAULT FALSE, note TEXT NOT NULL DEFAULT '',
 updated_by UUID REFERENCES app_users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_alerts (
 id UUID PRIMARY KEY, detection_id UUID NOT NULL UNIQUE REFERENCES sightings(detection_id) ON DELETE CASCADE,
 gewog_code INT NOT NULL REFERENCES gewog_info(gewog_code), affected_codes INT[] NOT NULL,
 title TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'High', status TEXT NOT NULL DEFAULT 'New'
 CHECK(status IN ('New','Acknowledged','Resolved')), response TEXT NOT NULL DEFAULT '',
 assigned_to UUID REFERENCES app_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_notifications (
 id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id), alert_id UUID REFERENCES app_alerts(id),
 message TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id, alert_id)
);
CREATE TABLE IF NOT EXISTS app_reports (
 id UUID PRIMARY KEY, author_id UUID NOT NULL REFERENCES app_users(id), gewog_code INT NOT NULL REFERENCES gewog_info(gewog_code),
 title TEXT NOT NULL, body TEXT NOT NULL, species TEXT NOT NULL, observed_at TIMESTAMPTZ NOT NULL,
 latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
 status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Reviewed','Closed')),
 admin_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
INSERT INTO app_settings VALUES ('system','{"threshold":0.8,"advisory":70,"interval":6}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS app_audit (
 id BIGSERIAL PRIMARY KEY, actor_id UUID REFERENCES app_users(id), action TEXT NOT NULL,
 entity TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_outbox (
 id BIGSERIAL PRIMARY KEY, channel TEXT NOT NULL CHECK(channel IN ('email','webhook')), payload TEXT NOT NULL,
 dedupe_key TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0,
 next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(), last_error TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_outbox_due ON app_outbox(status,next_attempt);
CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions(user_id);
