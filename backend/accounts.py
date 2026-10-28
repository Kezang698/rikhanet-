"""Authentication and account endpoints, mounted by main with its DB factory."""
import base64
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb
from . import security as s
from .delivery import queue


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)
    code: str = Field(default="", max_length=80)


class Setup(Login):
    name: str = Field(min_length=1, max_length=120)


class Email(Input):
    email: str = Field(max_length=254)


class Reset(Input):
    token: str = Field(max_length=200)
    password: str = Field(min_length=12, max_length=256)
    code: str = Field(default="", max_length=80)


class Password(Input):
    current: str = Field(max_length=256)
    password: str = Field(min_length=12, max_length=256)
    code: str = Field(default="", max_length=80)


class Factor(Input):
    password: str = Field(default="", max_length=256)
    code: str = Field(default="", max_length=80)


class Profile(Input):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    preferences: dict[str, bool] = Field(default_factory=dict, max_length=40)


def email(value):
    value = value.strip().lower()
    if "@" not in value or len(value) > 254 or any(c.isspace() for c in value) or "\r" in value or "\n" in value:
        raise HTTPException(422, "Enter a valid email address")
    return value


def router(connect):
    api = APIRouter(prefix="/auth")

    @api.get("/status")
    def status():
        with connect() as conn:
            return {"setup_required": conn.execute("SELECT count(*) AS n FROM app_users").fetchone()["n"] == 0}

    @api.post("/setup")
    def setup(body: Setup, request: Request, response: Response):
        with connect() as conn:
            s.throttle(conn, "setup:" + request.client.host, 10)
            conn.execute("SELECT pg_advisory_xact_lock(72645402)")
            if conn.execute("SELECT 1 FROM app_users LIMIT 1").fetchone():
                raise HTTPException(409, "Initial setup is complete. Sign in")
            user = conn.execute("INSERT INTO app_users(id,email,name,password_hash,role) VALUES (%s,%s,%s,%s,'admin') RETURNING *",
                (uuid4(), email(body.email), body.name.strip(), s.password_hash(body.password))).fetchone()
            s.audit(conn, user, "account.created", user["id"])
            s.create_session(conn, user, response)
            return {"user": s.public_user(conn, user)}

    @api.post("/login")
    def login(body: Login, request: Request, response: Response):
        with connect() as conn:
            s.throttle(conn, "login-ip:" + request.client.host, 60)
            s.throttle(conn, "login:" + body.email.strip().lower(), 12)
            user = conn.execute("SELECT * FROM app_users WHERE email=%s FOR UPDATE", (body.email.strip().lower(),)).fetchone()
            if not user or not user["active"] or not s.verify_password(body.password, user["password_hash"]):
                raise HTTPException(401, "Email or password is incorrect, or the account is inactive")
            if user["mfa_secret"] and not body.code:
                return {"mfa_required": True}
            if not s.check_factor(conn, user, body.code):
                raise HTTPException(401, "Verification code is invalid or already used")
            user = conn.execute("UPDATE app_users SET last_login=now() WHERE id=%s RETURNING *", (user["id"],)).fetchone()
            old = request.cookies.get(s.COOKIE)
            if old:
                conn.execute("DELETE FROM app_sessions WHERE token_hash=%s", (s.digest(old),))
            s.create_session(conn, user, response)
            s.audit(conn, user, "account.login", user["id"])
            return {"user": s.public_user(conn, user)}

    @api.get("/me")
    def me(request: Request):
        with connect() as conn:
            return {"user": s.public_user(conn, request.state.user)}

    @api.post("/logout")
    def logout(request: Request, response: Response):
        with connect() as conn:
            conn.execute("DELETE FROM app_sessions WHERE token_hash=%s", (request.state.user["token_hash"],))
        response.delete_cookie(s.COOKIE, path="/")
        response.delete_cookie(s.CSRF, path="/")
        return {"ok": True}

    @api.patch("/profile")
    def profile(body: Profile, request: Request):
        with connect() as conn:
            user = conn.execute("UPDATE app_users SET name=%s,phone=%s,preferences=%s WHERE id=%s RETURNING *",
                (body.name.strip(), body.phone.strip(), Jsonb(body.preferences), request.state.user["id"])).fetchone()
            s.audit(conn, user, "profile.updated", user["id"])
            return {"user": s.public_user(conn, user)}

    @api.post("/password")
    def change_password(body: Password, request: Request, response: Response):
        with connect() as conn:
            s.throttle(conn, "password:" + str(request.state.user["id"]), 10)
            user = conn.execute("SELECT * FROM app_users WHERE id=%s FOR UPDATE", (request.state.user["id"],)).fetchone()
            if not s.verify_password(body.current, user["password_hash"]) or not s.check_factor(conn, user, body.code):
                raise HTTPException(401, "Current password or verification code is incorrect")
            conn.execute("UPDATE app_users SET password_hash=%s WHERE id=%s", (s.password_hash(body.password), user["id"]))
            conn.execute("DELETE FROM app_sessions WHERE user_id=%s", (user["id"],))
            s.create_session(conn, user, response)
            s.audit(conn, user, "password.changed", user["id"])
            return {"ok": True}

    @api.post("/forgot")
    def forgot(body: Email, request: Request):
        with connect() as conn:
            s.throttle(conn, "forgot-ip:" + request.client.host, 20)
            s.throttle(conn, "forgot:" + body.email.strip().lower(), 3)
            user = conn.execute("SELECT * FROM app_users WHERE email=%s AND active", (body.email.strip().lower(),)).fetchone()
            if user:
                token = secrets.token_urlsafe(48)
                conn.execute("UPDATE app_password_resets SET used=TRUE WHERE user_id=%s", (user["id"],))
                conn.execute("INSERT INTO app_password_resets VALUES (%s,%s,now()+interval '15 minutes',FALSE)", (s.digest(token), user["id"]))
                origin = os.environ.get("APP_ORIGIN", "http://127.0.0.1:3000").rstrip("/")
                queue(conn, "email", {"to": user["email"], "subject": "Reset your RiKhaNET password",
                    "body": f"Open {origin}/login?reset={token} within 15 minutes. If you did not request this, ignore this email.",
                    "recipient_user_id": str(user["id"]), "kind": "password_reset",
                    "expires_at": (datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat()}, "reset:" + s.digest(token))
        return {"message": "If an active account matches, a reset email has been queued. Delivery requires the organization's email service."}

    @api.post("/reset")
    def reset(body: Reset, request: Request):
        with connect() as conn:
            s.throttle(conn, "reset:" + request.client.host, 20)
            reset = conn.execute("SELECT * FROM app_password_resets WHERE token_hash=%s AND NOT used AND expires_at>now() FOR UPDATE", (s.digest(body.token),)).fetchone()
            if not reset:
                raise HTTPException(400, "Reset link is invalid or expired")
            user = conn.execute("SELECT * FROM app_users WHERE id=%s AND active FOR UPDATE", (reset["user_id"],)).fetchone()
            if not user or not s.check_factor(conn, user, body.code):
                raise HTTPException(400, "Authenticator or unused recovery code is required")
            conn.execute("UPDATE app_users SET password_hash=%s WHERE id=%s", (s.password_hash(body.password), user["id"]))
            conn.execute("UPDATE app_password_resets SET used=TRUE WHERE user_id=%s", (user["id"],))
            conn.execute("DELETE FROM app_sessions WHERE user_id=%s", (user["id"],))
            s.audit(conn, user, "password.reset", user["id"])
        return {"message": "Password reset. Sign in with your new password"}

    @api.post("/mfa/setup")
    def mfa_setup(body: Factor, request: Request):
        with connect() as conn:
            s.throttle(conn, "mfa:" + str(request.state.user["id"]), 10)
            user = conn.execute("SELECT * FROM app_users WHERE id=%s FOR UPDATE", (request.state.user["id"],)).fetchone()
            if user["mfa_secret"] or not s.verify_password(body.password, user["password_hash"]):
                raise HTTPException(400, "Check your password; disable existing 2FA before setting it up again")
            secret = base64.b32encode(secrets.token_bytes(20)).decode()
            conn.execute("UPDATE app_users SET mfa_pending=%s,mfa_pending_at=now() WHERE id=%s", (s.cipher().encrypt(secret.encode()).decode(), user["id"]))
            return {"secret": secret, "uri": f"otpauth://totp/RiKhaNET:{quote(user['email'])}?secret={secret}&issuer=RiKhaNET&digits=6&period=30"}

    @api.post("/mfa/enable")
    def mfa_enable(body: Factor, request: Request):
        with connect() as conn:
            s.throttle(conn, "mfa:" + str(request.state.user["id"]), 10)
            user = conn.execute("SELECT * FROM app_users WHERE id=%s FOR UPDATE", (request.state.user["id"],)).fetchone()
            if not user["mfa_pending"] or user["mfa_pending_at"] < datetime.now(timezone.utc)-timedelta(minutes=10):
                raise HTTPException(400, "Restart authenticator setup")
            secret = s.cipher().decrypt(user["mfa_pending"].encode()).decode()
            counter = s.valid_totp(secret, body.code)
            if counter is None:
                raise HTTPException(400, "Authenticator code is incorrect")
            codes = [secrets.token_hex(6).upper() for _ in range(8)]
            conn.execute("UPDATE app_users SET mfa_secret=mfa_pending,mfa_pending=NULL,mfa_counter=%s,recovery_hashes=%s WHERE id=%s",
                (counter, Jsonb([s.digest(code) for code in codes]), user["id"]))
            conn.execute("DELETE FROM app_sessions WHERE user_id=%s AND token_hash<>%s", (user["id"], request.state.user["token_hash"]))
            s.audit(conn, user, "mfa.enabled", user["id"])
            return {"recovery_codes": codes}

    @api.post("/mfa/disable")
    def mfa_disable(body: Factor, request: Request):
        with connect() as conn:
            s.throttle(conn, "mfa:" + str(request.state.user["id"]), 10)
            user = conn.execute("SELECT * FROM app_users WHERE id=%s FOR UPDATE", (request.state.user["id"],)).fetchone()
            if not s.verify_password(body.password, user["password_hash"]) or not s.check_factor(conn, user, body.code):
                raise HTTPException(401, "Password or verification code is incorrect")
            conn.execute("UPDATE app_users SET mfa_secret=NULL,mfa_pending=NULL,recovery_hashes='[]',mfa_counter=-1 WHERE id=%s", (user["id"],))
            s.audit(conn, user, "mfa.disabled", user["id"])
            return {"ok": True}

    return api
