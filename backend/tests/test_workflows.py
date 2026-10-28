"""Workflow and permission checks use only disposable PostgreSQL schemas."""
import base64
import hashlib
import hmac
import json
import struct
import pytest
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlparse, parse_qs
from fastapi.testclient import TestClient
from backend import main, security, delivery
from backend.tests.test_api import database, client, trigger, add_predictions

PASSWORD='TestPassword-2026'


@pytest.fixture(autouse=True)
def no_model_warmup(monkeypatch):
    # Workflow tests exercise authorization and persistence; the core suite tests
    # the actual TFT separately. Do not load the model for every auth test run.
    monkeypatch.setattr(main,'prediction_status',lambda:{'status':'unavailable','reason':'Not required for workflow checks','missing_artifacts':[]})


def ranger(admin,zones=(1312,)):
    body={'name':'Ranger Test','email':str(uuid4())+'@test.bt','password':PASSWORD,'zones':list(zones)}
    response=admin.post('/rangers',json=body)
    assert response.status_code==201,response.text
    other=TestClient(main.app)
    other.headers['X-Rikhanet-Request']='1'
    result=other.post('/auth/login',json={'email':body['email'],'password':PASSWORD})
    assert result.status_code==200,result.text
    other.headers['X-CSRF-Token']=other.cookies.get('rikhanet_csrf')
    return other,response.json()


def test_authentication_and_csrf_are_required(client):
    anon=TestClient(main.app)
    assert anon.get('/sightings').status_code==401
    assert anon.post('/auth/login',json={'email':'admin@test.bt','password':PASSWORD}).status_code==403
    assert client.post('/auth/login',headers={'Origin':'https://attacker.invalid'},json={'email':'admin@test.bt','password':PASSWORD}).status_code==403
    assert client.post('/observations',headers={'X-CSRF-Token':'invalid'},json={'species':'elephant','confidence':.9}).status_code==403
    assert client.post('/auth/setup',json={'name':'Other','email':'other@test.bt','password':PASSWORD}).status_code==409
    assert client.post('/auth/login',json={'email':'unknown@test.bt','password':PASSWORD}).status_code==401


def test_selected_camera_gewog_is_stable_and_supplies_prediction_neighbours(client):
    body={'camera_id':'CAM-012','species':'elephant','confidence':.879,'expected_gewog_code':1302}
    first=client.post('/observations',json=body)
    second=client.post('/observations',json=body)
    assert first.status_code==second.status_code==201,first.text
    one,two=first.json(),second.json()
    assert one['gewog_code']==two['gewog_code']==1302
    assert one['gewog_name']=='Chhuzangang'
    assert (one['latitude'],one['longitude'])==(two['latitude'],two['longitude'])
    expected=next(row for row in client.get('/gewogs').json() if row['gewog_code']==1302)['neighbour_codes']
    focused=client.get(f"/predictions/{one['detection_id']}").json()
    assert focused['trigger']['gewog_code']==1302 and focused['expected_neighbours']==expected
    assert client.post('/observations',json={**body,'latitude':26.92768665,'longitude':90.51287962}).status_code==422
    assert client.get('/sightings').json()['total']==2  # Mismatched GPS rolls back the entire trigger.


def test_camera_samples_resolve_inside_all_selected_gewogs(client):
    from backend.helpers.gewog_lookup import camera_sample_point,find_gewog
    for gewog in client.get('/gewogs').json():
        code=gewog['gewog_code']
        point=camera_sample_point(code,f'CAM-{code}')
        assert find_gewog(point['latitude'],point['longitude'])['gewog_code']==code


def test_ranger_scope_and_suspension(client,database):
    row=trigger(client)
    other,person=ranger(client,zones=(1306,))
    assert other.get('/sightings').json()['items']==[]
    for path in [f"/sightings/{row['detection_id']}",f"/sightings/{row['detection_id']}/image",f"/predictions/{row['detection_id']}"]:
        assert other.get(path).status_code==403
    assert other.post(f"/enrich/{row['detection_id']}").status_code==403
    assert other.get('/settings').status_code==403
    assert other.post('/imports/sightings',content=b'anything').status_code==403
    assert other.post('/rangers',json={'name':'X','email':'x@test.bt','password':PASSWORD}).status_code==403
    body={'name':person['name'],'email':person['email'],'zones':[1306],'active':False}
    assert client.patch(f"/rangers/{person['id']}",json=body).status_code==200
    assert other.get('/auth/me').status_code==401


def test_review_notes_flags_and_approval_audit(client):
    row=trigger(client);path=f"/sightings/{row['detection_id']}/review"
    other,_=ranger(client)
    assert other.patch(path,json={'flagged':True,'note':'Check the species'}).status_code==200
    assert other.patch(path,json={'status':'Approved'}).status_code==403
    assert client.patch(path,json={'status':'Approved','flagged':False,'note':'Verified by administrator'}).status_code==200
    stored=client.get('/sightings').json()['items'][0]
    assert stored['review_status']=='Approved' and stored['flagged'] is False
    history=client.get(path).json()
    assert len(history)==2 and history[0]['details']['note']=='Verified by administrator'


def test_field_reports_are_persistent_and_scoped(client):
    other,_=ranger(client)
    body={'title':'Elephant near trail','body':'Patrol observed a herd.','species':'Asian Elephant',
          'latitude':26.92768665,'longitude':90.51287962,'observed_at':datetime.now(timezone.utc).isoformat()}
    created=other.post('/reports',json=body)
    assert created.status_code==201,created.text
    report=created.json()
    assert len(client.get('/reports').json())==1
    assert other.patch(f"/reports/{report['id']}",json={'status':'Closed'}).status_code==403
    assert client.patch(f"/reports/{report['id']}",json={'status':'Reviewed','admin_note':'Patrol confirmed'}).status_code==200
    assert other.get('/reports').json()[0]['admin_note']=='Patrol confirmed'
    stranger,_=ranger(client,(1306,))
    assert stranger.get('/reports').json()==[]
    assert stranger.post('/reports',json=body).status_code==403
    assert other.post('/reports',json={**body,'latitude':0,'longitude':0}).status_code==422


def test_automatic_alert_is_unique_and_response_is_saved(client,database,monkeypatch):
    row=trigger(client)
    other,person=ranger(client,(1302,))
    with database() as conn:
        add_predictions(conn,row['detection_id'])
    alerts=client.get('/alerts').json()
    assert len(alerts)==1 and len(client.get('/alerts').json())==1
    alert=alerts[0]
    assert other.get('/alerts').json()[0]['id']==alert['id']
    assert other.post('/notifications/read').status_code==200
    assert all(item['read_at'] for item in other.get('/notifications').json())
    assert client.patch(f"/alerts/{alert['id']}",json={'status':'Resolved','response':'Done'}).status_code==409
    assert client.patch(f"/alerts/{alert['id']}",json={'status':'Acknowledged','assigned_to':person['id']}).status_code==200
    assert other.patch(f"/alerts/{alert['id']}",json={'status':'Resolved','assigned_to':person['id'],'response':'Patrol notified'}).status_code==200
    assert client.get('/alerts').json()[0]['response']=='Patrol notified'
    with database() as conn:
        assert conn.execute('SELECT count(*) AS n FROM app_notifications').fetchone()['n']==2
        assert conn.execute('SELECT count(*) AS n FROM app_outbox').fetchone()['n']==3
        assert 'wildlife' not in conn.execute('SELECT payload FROM app_outbox LIMIT 1').fetchone()['payload']


def test_password_change_revokes_old_sessions(client):
    token=client.cookies.get('rikhanet_session')
    response=client.post('/auth/password',json={'current':PASSWORD,'password':'ReplacementPassword-2026'})
    assert response.status_code==200,response.text
    old=TestClient(main.app);old.cookies.set('rikhanet_session',token)
    assert old.get('/auth/me').status_code==401
    assert client.get('/auth/me').status_code==200
    assert client.post('/auth/login',json={'email':'admin@test.bt','password':PASSWORD}).status_code==401


def test_password_reset_is_expiring_and_single_use(client,database):
    result=client.post('/auth/forgot',json={'email':'admin@test.bt'})
    assert result.status_code==200 and 'token' not in result.json()
    with database() as conn:
        encrypted=conn.execute("SELECT payload FROM app_outbox WHERE dedupe_key LIKE 'reset:%%' ORDER BY id DESC LIMIT 1").fetchone()['payload']
    payload=json.loads(security.cipher().decrypt(encrypted.encode()))
    token=parse_qs(urlparse(payload['body'].split('Open ')[1].split(' within')[0]).query)['reset'][0]
    body={'token':token,'password':'NewResetPassword-2026'}
    assert client.post('/auth/reset',json=body).status_code==200
    assert client.post('/auth/reset',json=body).status_code==400
    assert client.get('/auth/me').status_code==401
    assert client.post('/auth/login',json={'email':'admin@test.bt','password':body['password']}).status_code==200


def totp(secret,when):
    value=hmac.new(base64.b32decode(secret),struct.pack('>Q',int(when//30)),hashlib.sha1).digest()
    offset=value[-1]&15
    return str((struct.unpack('>I',value[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)


def test_totp_enable_and_recovery_code_single_use(client,monkeypatch):
    result=client.post('/auth/mfa/setup',json={'password':PASSWORD})
    assert result.status_code==200,result.text
    secret=result.json()['secret']
    now=security.time.time()
    enabled=client.post('/auth/mfa/enable',json={'code':totp(secret,now)})
    assert enabled.status_code==200,enabled.text
    codes=enabled.json()['recovery_codes'];assert len(codes)==8
    assert client.get('/auth/me').json()['user']['mfa_enabled']
    other=TestClient(main.app);other.headers['X-Rikhanet-Request']='1'
    credentials={'email':'admin@test.bt','password':PASSWORD}
    assert other.post('/auth/login',json=credentials).json()=={'mfa_required':True}
    assert other.post('/auth/login',json={**credentials,'code':totp(secret,now)}).status_code==401
    assert other.post('/auth/login',json={**credentials,'code':codes[0]}).status_code==200
    assert other.post('/auth/login',json={**credentials,'code':codes[0]}).status_code==401
    monkeypatch.setattr(security.time,'time',lambda:now+30)
    assert other.post('/auth/login',json={**credentials,'code':totp(secret,now+30)}).status_code==200


def test_profile_preferences_and_settings_persist(client):
    body={'name':'Updated Admin','phone':'+975 17000000','preferences':{'wildlife_alerts':False}}
    assert client.patch('/auth/profile',json=body).status_code==200
    assert client.get('/auth/me').json()['user']['preferences']==body['preferences']
    settings={'threshold':.85,'advisory':65,'interval':3}
    assert client.patch('/settings',json=settings).status_code==200
    assert client.get('/settings').json()['config']==settings


def test_webhook_signature_retry_and_expired_delivery(client,database,monkeypatch):
    import httpx
    monkeypatch.setenv('RIKHANET_ALERT_WEBHOOK_URL','https://receiver.example/alerts')
    monkeypatch.setenv('RIKHANET_WEBHOOK_SECRET','x'*32)
    monkeypatch.delenv('SMTP_HOST',raising=False)
    calls=[]
    def send(url,content,headers,**kwargs):
        calls.append((content,headers))
        assert headers['X-RiKhaNET-Signature']==hmac.new(b'x'*32,content,hashlib.sha256).hexdigest()
        return httpx.Response(503 if len(calls)==1 else 200,request=httpx.Request('POST',url))
    monkeypatch.setattr(delivery.httpx,'post',send)
    with database() as conn:
        delivery.queue(conn,'webhook',{'event':'test'},'webhook-test')
        delivery.queue(conn,'webhook',{'expires_at':'2020-01-01T00:00:00+00:00'},'expired-test')
    delivery.deliver_due(database)
    with database() as conn:
        statuses={row['dedupe_key']:row['status'] for row in conn.execute('SELECT dedupe_key,status FROM app_outbox').fetchall()}
        assert statuses=={'webhook-test':'retry','expired-test':'expired'}
    assert client.post('/notifications/retry').status_code==200
    delivery.deliver_due(database)
    with database() as conn:
        assert conn.execute("SELECT status FROM app_outbox WHERE dedupe_key='webhook-test'").fetchone()['status']=='sent'
    assert len(calls)==2


def test_smtp_delivery_uses_tls_and_never_sends_unconfigured(client,database,monkeypatch):
    monkeypatch.delenv('SMTP_HOST',raising=False)
    monkeypatch.delenv('RIKHANET_ALERT_WEBHOOK_URL',raising=False)
    sent=[]
    class SMTP:
        def __init__(self,*args,**kwargs):self.tls=False
        def __enter__(self):return self
        def __exit__(self,*args):return False
        def starttls(self,**kwargs):self.tls=True
        def login(self,*args):assert self.tls
        def send_message(self,message):assert self.tls;sent.append(message)
    monkeypatch.setattr(delivery.smtplib,'SMTP',SMTP)
    with database() as conn:
        delivery.queue(conn,'email',{'to':'recipient@example.com','subject':'Test','body':'Stored message'},'smtp-test')
    delivery.deliver_due(database)
    assert sent==[]
    monkeypatch.setenv('SMTP_HOST','smtp.example.com');monkeypatch.setenv('SMTP_FROM','sender@example.com')
    monkeypatch.setenv('SMTP_USER','test');monkeypatch.setenv('SMTP_PASSWORD','test');monkeypatch.setenv('SMTP_SSL','0')
    delivery.deliver_due(database)
    assert len(sent)==1 and sent[0]['To']=='recipient@example.com'
    user=client.get('/auth/me').json()['user']
    assert client.patch('/auth/profile',json={'name':user['name'],'phone':'','preferences':{'wildlife_alerts':False}}).status_code==200
    with database() as conn:
        delivery.queue(conn,'email',{'to':user['email'],'subject':'Alert','body':'Message','recipient_user_id':user['id'],'kind':'alert','allowed_codes':[1312]},'cancelled-test')
    delivery.deliver_due(database)
    assert len(sent)==1
    with database() as conn:
        assert conn.execute("SELECT status FROM app_outbox WHERE dedupe_key='cancelled-test'").fetchone()['status']=='cancelled'
