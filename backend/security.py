"""Server sessions, scrypt passwords, encrypted TOTP secrets and one-use recovery codes."""
import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from urllib.parse import quote
from cryptography.fernet import Fernet
from fastapi import HTTPException
from psycopg.types.json import Jsonb

COOKIE = "rikhanet_session"
CSRF = "rikhanet_csrf"
PUBLIC = {"/health", "/auth/status", "/auth/setup", "/auth/login", "/auth/forgot", "/auth/reset"}


def cipher():
    key = os.environ.get("RIKHANET_SECRET_KEY")
    if not key:
        path = Path(os.environ.get("RIKHANET_SECRET_FILE", Path(__file__).resolve().parents[1] / "uploads/app-secrets/master.key"))
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not path.exists():
            try:
                with path.open("xb") as stream:
                    stream.write(Fernet.generate_key())
                path.chmod(0o600)
            except FileExistsError:
                pass
        key = path.read_bytes().strip()
    return Fernet(key)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password):
    if not 12 <= len(password) <= 256:
        raise HTTPException(422, "Use a password of 12–256 characters")
    salt = secrets.token_bytes(16)
    result = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=3, maxmem=64*1024*1024)
    return f"scrypt${salt.hex()}${result.hex()}"


def verify_password(password, encoded):
    try:
        _, salt, expected = encoded.split("$")
        result = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64*1024*1024)
        return hmac.compare_digest(result.hex(), expected)
    except (ValueError, TypeError):
        return False


def audit(conn, user, action, entity, details=None):
    conn.execute("INSERT INTO app_audit(actor_id, action, entity, details) VALUES (%s,%s,%s,%s)",
                 (user["id"] if user else None, action, str(entity), Jsonb(details or {})))


def public_user(conn, user):
    zones = conn.execute("SELECT gewog_code FROM app_assignments WHERE user_id=%s ORDER BY gewog_code", (user["id"],)).fetchall()
    return {**{key: user[key] for key in ("id", "email", "name", "role", "active", "phone", "notes", "preferences", "created_at", "last_login")},
            "zones": [str(row["gewog_code"]) for row in zones], "mfa_enabled": bool(user["mfa_secret"])}


def session_user(conn, token):
    if not token or len(token) > 200:
        raise HTTPException(401, "Sign in to continue")
    row = conn.execute("""SELECT u.*, s.csrf_hash, s.token_hash FROM app_users u JOIN app_sessions s ON s.user_id=u.id
        WHERE s.token_hash=%s AND s.expires_at>now() AND u.active=TRUE""", (digest(token),)).fetchone()
    if not row:
        raise HTTPException(401, "Your session has expired. Sign in again")
    row["zones"] = [int(item["gewog_code"]) for item in conn.execute("SELECT gewog_code FROM app_assignments WHERE user_id=%s", (row["id"],)).fetchall()]
    return row


def create_session(conn, user, response):
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    conn.execute("DELETE FROM app_sessions WHERE expires_at<now()")
    conn.execute("INSERT INTO app_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES (%s,%s,%s,now()+interval '8 hours')",
                 (digest(token), user["id"], digest(csrf)))
    secure = os.environ.get("COOKIE_SECURE", "0") == "1"
    response.set_cookie(COOKIE, token, httponly=True, secure=secure, samesite="strict", max_age=28800, path="/")
    response.set_cookie(CSRF, csrf, httponly=False, secure=secure, samesite="strict", max_age=28800, path="/")


def throttle(conn, key, limit=20):
    row = conn.execute("""INSERT INTO app_rate_limits(key) VALUES (%s) ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN app_rate_limits.started_at<now()-interval '15 minutes' THEN 1 ELSE app_rate_limits.attempts+1 END,
        started_at=CASE WHEN app_rate_limits.started_at<now()-interval '15 minutes' THEN now() ELSE app_rate_limits.started_at END
        RETURNING attempts""", (digest(key),)).fetchone()
    conn.commit()  # Failed authentication must not roll back rate limiting.
    if row["attempts"] > limit:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes")


def check_factor(conn, user, code):
    if not user["mfa_secret"]:
        return True
    secret = cipher().decrypt(user["mfa_secret"].encode()).decode()
    counter = valid_totp(secret, code, user["mfa_counter"])
    if counter is not None:
        conn.execute("UPDATE app_users SET mfa_counter=%s WHERE id=%s", (counter, user["id"]))
        return True
    hashes = list(user["recovery_hashes"])
    target = digest(code.strip().replace("-", "").upper())
    if target in hashes:
        hashes.remove(target)
        conn.execute("UPDATE app_users SET recovery_hashes=%s WHERE id=%s", (Jsonb(hashes), user["id"]))
        return True
    return False


def valid_totp(secret, code, last=-1):
    if not code.isascii() or not code.isdigit() or len(code) != 6:
        return None
    for counter in range(int(time.time() // 30)-1, int(time.time() // 30)+2):
        if counter <= last:
            continue
        value = hmac.new(base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = value[-1] & 15
        expected = str((struct.unpack(">I", value[offset:offset+4])[0] & 0x7fffffff) % 1_000_000).zfill(6)
        if hmac.compare_digest(expected, code):
            return counter
    return None


def require_admin(user):
    if user["role"] != "admin":
        raise HTTPException(403, "Administrator permission required")


def require_zone(user, code):
    if user["role"] != "admin" and code not in user["zones"]:
        raise HTTPException(403, "This gewog is outside your assignment")


def require_sighting(conn, user, detection_id):
    row = conn.execute("SELECT gewog_code FROM sightings WHERE detection_id=%s", (detection_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Sighting not found")
    require_zone(user, row["gewog_code"])
