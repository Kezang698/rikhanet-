"""Persistent ranger, review, report, alert and configuration workflows."""
from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, Request
from pydantic import Field
from psycopg.types.json import Jsonb
from .accounts import Input, email
from . import security as s
from .delivery import configuration, sync_alerts
from .helpers.gewog_lookup import find_gewog


class Ranger(Input):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=254)
    phone: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=3000)
    zones: list[int] = Field(default_factory=list, max_length=17)
    active: bool = True
    password: str | None = Field(default=None, min_length=12, max_length=256)


class Review(Input):
    status: Literal['Needs review','Approved','Rejected'] | None = None
    flagged: bool | None = None
    note: str = Field(default="", max_length=5000)


class Report(Input):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=10000)
    species: str = Field(min_length=1, max_length=120)
    observed_at: datetime
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class ReportUpdate(Input):
    status: Literal['Submitted','Reviewed','Closed']
    admin_note: str = Field(default="", max_length=5000)


class AlertUpdate(Input):
    status: Literal['New','Acknowledged','Resolved']
    response: str = Field(default="", max_length=5000)
    assigned_to: UUID | None = None


class Settings(Input):
    threshold: float = Field(ge=0, le=1, allow_inf_nan=False)
    advisory: int = Field(ge=0, le=100)
    interval: int = Field(ge=1, le=24)


def router(connect):
    api = APIRouter()

    @api.get('/rangers')
    def rangers(request: Request):
        with connect() as conn:
            user = request.state.user
            rows = conn.execute("SELECT * FROM app_users WHERE role='ranger' AND (%s OR id=%s) ORDER BY name", (user['role']=='admin',user['id'])).fetchall()
            return [s.public_user(conn, row) for row in rows]

    def save_ranger(conn, body, user, ranger_id=None):
        s.require_admin(user)
        address = email(body.email)
        if conn.execute('SELECT 1 FROM app_users WHERE email=%s AND (%s::uuid IS NULL OR id<>%s)', (address,ranger_id,ranger_id)).fetchone():
            raise HTTPException(409,'This email already belongs to an account')
        codes = {row['gewog_code'] for row in conn.execute('SELECT gewog_code FROM gewog_info').fetchall()}
        if not set(body.zones).issubset(codes):
            raise HTTPException(422,'Unknown assigned gewog')
        if ranger_id:
            row = conn.execute("SELECT * FROM app_users WHERE id=%s AND role='ranger' FOR UPDATE",(ranger_id,)).fetchone()
            if not row:
                raise HTTPException(404,'Ranger not found')
            conn.execute('UPDATE app_users SET name=%s,email=%s,phone=%s,notes=%s,active=%s WHERE id=%s',
                (body.name.strip(),address,body.phone,body.notes,body.active,ranger_id))
            if body.password:
                conn.execute('UPDATE app_users SET password_hash=%s WHERE id=%s',(s.password_hash(body.password),ranger_id))
            conn.execute('DELETE FROM app_sessions WHERE user_id=%s',(ranger_id,))
            conn.execute('DELETE FROM app_password_resets WHERE user_id=%s',(ranger_id,))
        else:
            if not body.password:
                raise HTTPException(422,'A password of at least 12 characters is required')
            ranger_id = uuid4()
            conn.execute("INSERT INTO app_users(id,email,name,password_hash,role,phone,notes,active) VALUES (%s,%s,%s,%s,'ranger',%s,%s,%s)",
                (ranger_id,address,body.name.strip(),s.password_hash(body.password),body.phone,body.notes,body.active))
        conn.execute('DELETE FROM app_assignments WHERE user_id=%s',(ranger_id,))
        for code in set(body.zones):
            conn.execute('INSERT INTO app_assignments VALUES (%s,%s)',(ranger_id,code))
        s.audit(conn,user,'ranger.saved',ranger_id)
        return s.public_user(conn,conn.execute('SELECT * FROM app_users WHERE id=%s',(ranger_id,)).fetchone())

    @api.post('/rangers',status_code=201)
    def create_ranger(body: Ranger, request: Request):
        with connect() as conn:
            return save_ranger(conn,body,request.state.user)

    @api.patch('/rangers/{ranger_id}')
    def update_ranger(ranger_id: UUID, body: Ranger, request: Request):
        with connect() as conn:
            return save_ranger(conn,body,request.state.user,ranger_id)

    @api.patch('/sightings/{detection_id}/review')
    def review(detection_id: UUID, body: Review, request: Request):
        user=request.state.user
        with connect() as conn:
            s.require_sighting(conn,user,detection_id)
            if body.status is not None:
                s.require_admin(user)
            existing=conn.execute('SELECT * FROM app_reviews WHERE detection_id=%s FOR UPDATE',(detection_id,)).fetchone()
            status=body.status or (existing['status'] if existing else 'Needs review')
            flagged=body.flagged if body.flagged is not None else (existing['flagged'] if existing else False)
            if flagged:
                status='Needs review'
            row=conn.execute('''INSERT INTO app_reviews(detection_id,status,flagged,note,updated_by) VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT(detection_id) DO UPDATE SET status=EXCLUDED.status,flagged=EXCLUDED.flagged,note=EXCLUDED.note,
                updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *''',(detection_id,status,flagged,body.note,user['id'])).fetchone()
            s.audit(conn,user,'sighting.reviewed',detection_id,{'status':status,'flagged':flagged,'note':body.note})
            return row

    @api.get('/sightings/{detection_id}/review')
    def review_history(detection_id: UUID, request: Request):
        with connect() as conn:
            s.require_sighting(conn,request.state.user,detection_id)
            return conn.execute("SELECT a.id,a.action,a.details,a.created_at,u.name FROM app_audit a LEFT JOIN app_users u ON u.id=a.actor_id WHERE entity=%s AND action='sighting.reviewed' ORDER BY a.id DESC LIMIT 100",(str(detection_id),)).fetchall()

    @api.get('/reports')
    def reports(request: Request):
        user=request.state.user
        with connect() as conn:
            return conn.execute('''SELECT r.*,u.name AS author_name,g.gewog_name FROM app_reports r JOIN app_users u ON u.id=r.author_id
                JOIN gewog_info g USING(gewog_code) WHERE %s OR (author_id=%s AND r.gewog_code=ANY(%s)) ORDER BY created_at DESC LIMIT 1000''',
                (user['role']=='admin',user['id'],user['zones'])).fetchall()

    @api.post('/reports',status_code=201)
    def create_report(body: Report,request: Request):
        if body.observed_at.tzinfo is None or body.observed_at>datetime.now(timezone.utc)+timedelta(minutes=5):
            raise HTTPException(422,'Use a past observation time with a timezone')
        try:
            code=find_gewog(body.latitude,body.longitude)['gewog_code']
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        user=request.state.user
        s.require_zone(user,code)
        with connect() as conn:
            row=conn.execute('''INSERT INTO app_reports(id,author_id,gewog_code,title,body,species,observed_at,latitude,longitude)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
                (uuid4(),user['id'],code,body.title.strip(),body.body.strip(),body.species.strip(),body.observed_at,body.latitude,body.longitude)).fetchone()
            s.audit(conn,user,'report.created',row['id'])
            return row

    @api.patch('/reports/{report_id}')
    def update_report(report_id: UUID,body: ReportUpdate,request: Request):
        s.require_admin(request.state.user)
        with connect() as conn:
            row=conn.execute('UPDATE app_reports SET status=%s,admin_note=%s,updated_at=now() WHERE id=%s RETURNING *',
                (body.status,body.admin_note,report_id)).fetchone()
            if not row:
                raise HTTPException(404,'Report not found')
            s.audit(conn,request.state.user,'report.reviewed',report_id,body.model_dump())
            return row

    @api.get('/alerts')
    def alerts(request: Request):
        user=request.state.user
        with connect() as conn:
            sync_alerts(conn)
            return conn.execute('''SELECT a.*,g.gewog_name,u.name AS assigned_name FROM app_alerts a JOIN gewog_info g USING(gewog_code)
                LEFT JOIN app_users u ON u.id=a.assigned_to WHERE %s OR (a.gewog_code=ANY(%s) OR a.affected_codes && %s::int[])
                ORDER BY a.created_at DESC LIMIT 1000''',(user['role']=='admin',user['zones'],user['zones'])).fetchall()

    @api.patch('/alerts/{alert_id}')
    def update_alert(alert_id: UUID,body: AlertUpdate,request: Request):
        user=request.state.user
        with connect() as conn:
            row=conn.execute('SELECT * FROM app_alerts WHERE id=%s FOR UPDATE',(alert_id,)).fetchone()
            if not row:
                raise HTTPException(404,'Alert not found')
            if user['role']!='admin' and not set(user['zones']) & {row['gewog_code'],*row['affected_codes']}:
                raise HTTPException(403,'Alert is outside your assignment')
            if user['role']!='admin' and body.assigned_to!=row['assigned_to']:
                raise HTTPException(403,'Only administrators assign alerts')
            if body.assigned_to:
                assignee=conn.execute("SELECT id FROM app_users WHERE id=%s AND role='ranger' AND active AND EXISTS(SELECT 1 FROM app_assignments x WHERE x.user_id=app_users.id AND gewog_code=ANY(%s))",
                    (body.assigned_to,[row['gewog_code'],*row['affected_codes']])).fetchone()
                if not assignee:
                    raise HTTPException(422,'Assign an active ranger responsible for an affected gewog')
            if body.status=='Resolved' and (row['status']=='New' or not body.response.strip()):
                raise HTTPException(409,'Acknowledge the alert and record a response before resolving')
            result=conn.execute('UPDATE app_alerts SET status=%s,response=%s,assigned_to=%s,updated_at=now() WHERE id=%s RETURNING *',
                (body.status,body.response,body.assigned_to,alert_id)).fetchone()
            s.audit(conn,user,'alert.updated',alert_id,{'status':body.status,'response':body.response,'assigned_to':str(body.assigned_to) if body.assigned_to else None})
            return result

    @api.get('/notifications')
    def notifications(request: Request):
        with connect() as conn:
            return conn.execute('SELECT id,alert_id,message,read_at,created_at FROM app_notifications WHERE user_id=%s ORDER BY id DESC LIMIT 100',(request.state.user['id'],)).fetchall()

    @api.post('/notifications/read')
    def mark_read(request: Request):
        with connect() as conn:
            conn.execute('UPDATE app_notifications SET read_at=now() WHERE user_id=%s AND read_at IS NULL',(request.state.user['id'],))
        return {'ok':True}

    @api.get('/settings')
    def settings(request: Request):
        s.require_admin(request.state.user)
        with connect() as conn:
            return {'config':conn.execute("SELECT value FROM app_settings WHERE key='system'").fetchone()['value'],
                'delivery':configuration(),'outbox':conn.execute('SELECT id,channel,status,attempts,last_error,created_at FROM app_outbox ORDER BY id DESC LIMIT 100').fetchall()}

    @api.get('/config')
    def app_config():
        with connect() as conn:
            return {'config':conn.execute("SELECT value FROM app_settings WHERE key='system'").fetchone()['value']}

    @api.patch('/settings')
    def save_settings(body: Settings,request: Request):
        s.require_admin(request.state.user)
        with connect() as conn:
            conn.execute("UPDATE app_settings SET value=%s WHERE key='system'",(Jsonb(body.model_dump()),))
            s.audit(conn,request.state.user,'settings.updated','system',body.model_dump())
        return {'config':body.model_dump()}

    @api.post('/notifications/retry')
    def retry(request: Request):
        s.require_admin(request.state.user)
        with connect() as conn:
            conn.execute("UPDATE app_outbox SET status='pending',next_attempt=now() WHERE status IN ('retry','failed')")
        return {'ok':True}

    @api.get('/audit')
    def activity(request: Request):
        user=request.state.user
        with connect() as conn:
            return conn.execute('SELECT id,action,entity,details,created_at FROM app_audit WHERE %s OR actor_id=%s ORDER BY id DESC LIMIT 100',
                (user['role']=='admin',user['id'])).fetchall()

    return api
