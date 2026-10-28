"""Persistent notification outbox. Missing delivery configuration never means sent."""
import asyncio
import hashlib
import hmac
import json
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from uuid import uuid4
import httpx
from .security import cipher


def queue(conn, channel, payload, key):
    encrypted = cipher().encrypt(json.dumps(payload).encode()).decode()
    conn.execute("INSERT INTO app_outbox(channel,payload,dedupe_key) VALUES (%s,%s,%s) ON CONFLICT(dedupe_key) DO NOTHING",
                 (channel, encrypted, key))


def configuration():
    return {"email_configured": bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM")),
            "webhook_configured": bool(os.environ.get("RIKHANET_ALERT_WEBHOOK_URL") and len(os.environ.get("RIKHANET_WEBHOOK_SECRET", "")) >= 32)}


def sync_alerts(conn):
    triggers = conn.execute("""SELECT s.detection_id,s.timestamp,s.gewog_code,g.gewog_name,
        array_agg(p.nbr_code ORDER BY p.nbr_code) AS affected_codes
        FROM sightings s JOIN predictions p USING(detection_id) JOIN gewog_info g ON g.gewog_code=s.gewog_code
        WHERE p.risk_label='HIGH' AND s.discarded=FALSE AND s.timestamp>now()-interval '24 hours'
        AND NOT EXISTS(SELECT 1 FROM app_alerts a WHERE a.detection_id=s.detection_id)
        GROUP BY s.detection_id,s.gewog_code,g.gewog_name""").fetchall()
    for trigger in triggers:
        alert_id = uuid4()
        title = f"High elephant occurrence risk near {trigger['gewog_name']}"
        created = conn.execute("""INSERT INTO app_alerts(id,detection_id,gewog_code,affected_codes,title)
            VALUES (%s,%s,%s,%s,%s) ON CONFLICT(detection_id) DO NOTHING RETURNING id""",
            (alert_id, trigger["detection_id"], trigger["gewog_code"], trigger["affected_codes"], title)).fetchone()
        if not created:
            continue
        codes = [trigger["gewog_code"], *trigger["affected_codes"]]
        expires = (trigger["timestamp"] + timedelta(hours=24)).isoformat()
        users = conn.execute("""SELECT u.* FROM app_users u WHERE active AND (role='admin' OR EXISTS
            (SELECT 1 FROM app_assignments a WHERE a.user_id=u.id AND a.gewog_code=ANY(%s)))""", (codes,)).fetchall()
        for user in users:
            conn.execute("INSERT INTO app_notifications(user_id,alert_id,message) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (user["id"], alert_id, title))
            if user["preferences"].get("wildlife_alerts", True):
                queue(conn, "email", {"to": user["email"], "subject": "RiKhaNET wildlife alert", "body": title + ". Sign in to review the affected gewogs and forecast.", "expires_at": expires,
                    "recipient_user_id": str(user["id"]), "kind": "alert", "allowed_codes": codes}, f"alert:{alert_id}:user:{user['id']}")
        queue(conn, "webhook", {"event": "wildlife.high_risk", "alert_id": str(alert_id), "detection_id": str(trigger["detection_id"]), "affected_codes": trigger["affected_codes"], "title": title, "expires_at": expires}, f"alert:{alert_id}:webhook")


def deliver_due(connect):
    config = configuration()
    for _ in range(10):
        with connect() as conn:
            row = conn.execute("""SELECT * FROM app_outbox WHERE status IN ('pending','retry') AND next_attempt<=now()
                AND ((channel='email' AND %s) OR (channel='webhook' AND %s))
                ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1""", (config["email_configured"], config["webhook_configured"])).fetchone()
            if not row:
                return
            try:
                payload = json.loads(cipher().decrypt(row["payload"].encode()))
                if payload.get("expires_at") and datetime.fromisoformat(payload["expires_at"]) <= datetime.now(timezone.utc):
                    conn.execute("UPDATE app_outbox SET status='expired' WHERE id=%s", (row["id"],))
                    continue
                if payload.get("recipient_user_id"):
                    recipient = conn.execute("SELECT * FROM app_users WHERE id=%s AND active", (payload["recipient_user_id"],)).fetchone()
                    permitted = bool(recipient and recipient["email"] == payload["to"])
                    if permitted and payload.get("kind") == "alert":
                        permitted = recipient["preferences"].get("wildlife_alerts", True)
                        if permitted and recipient["role"] != "admin":
                            permitted = bool(conn.execute("SELECT 1 FROM app_assignments WHERE user_id=%s AND gewog_code=ANY(%s)", (recipient["id"], payload["allowed_codes"])).fetchone())
                    if not permitted:
                        conn.execute("UPDATE app_outbox SET status='cancelled' WHERE id=%s", (row["id"],))
                        continue
                if row["channel"] == "email":
                    message = EmailMessage()
                    message["From"], message["To"], message["Subject"] = os.environ["SMTP_FROM"], payload["to"], payload["subject"]
                    message.set_content(payload["body"])
                    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587"))
                    implicit = os.environ.get("SMTP_SSL", "0") == "1"
                    factory = smtplib.SMTP_SSL if implicit else smtplib.SMTP
                    with factory(host, port, timeout=8) as client:
                        if not implicit:
                            client.starttls(context=ssl.create_default_context())
                        if os.environ.get("SMTP_USER"):
                            client.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                        client.send_message(message)
                else:
                    body = json.dumps(payload, sort_keys=True).encode()
                    signature = hmac.new(os.environ.get("RIKHANET_WEBHOOK_SECRET", "").encode(), body, hashlib.sha256).hexdigest()
                    url = os.environ["RIKHANET_ALERT_WEBHOOK_URL"]
                    if not url.startswith("https://"):
                        raise ValueError("Webhook requires HTTPS")
                    response = httpx.post(url, content=body, headers={"Content-Type": "application/json", "X-RiKhaNET-Signature": signature, "Idempotency-Key": row["dedupe_key"]}, timeout=8, follow_redirects=False)
                    response.raise_for_status()
                conn.execute("UPDATE app_outbox SET status='sent',attempts=attempts+1,last_error='' WHERE id=%s", (row["id"],))
            except Exception as exc:
                # Do not persist SMTP credentials, reset tokens or receiver responses in logs.
                conn.execute("""UPDATE app_outbox SET status=CASE WHEN attempts>=7 THEN 'failed' ELSE 'retry' END,
                    attempts=attempts+1,last_error=%s,next_attempt=now()+interval '5 minutes' WHERE id=%s""", (type(exc).__name__, row["id"]))


async def worker(connect):
    import logging
    while True:
        try:
            def run():
                with connect() as conn:
                    sync_alerts(conn)
                deliver_due(connect)
            await asyncio.to_thread(run)
        except Exception:
            logging.getLogger("rikhanet.delivery").exception("Notification worker could not complete a cycle")
        await asyncio.sleep(20)
