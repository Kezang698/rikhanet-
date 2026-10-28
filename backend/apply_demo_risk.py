"""Apply a reviewed synthetic-only demo plan and regenerate its actual TFT output.

Run explicitly with: python -m backend.apply_demo_risk --apply
The source image, real observations, model and risk thresholds are not edited.
"""
import argparse
import csv
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo
from psycopg.types.json import Jsonb
from . import config
from .db import connect
from .features import build_pair_rows
from .tft_runtime import get_runtime
from .enrichment import fetch_weather_batch
from .inference import risk_label
from .security import cipher, audit


def apply():
    plan=json.loads((config.ROOT/'data/synthetic-mixed-risk-plan.json').read_text(encoding='utf-8'))
    if plan['profile']!='quiet_gelephu_other_wildlife' or len(plan['changes'])!=6:
        raise ValueError('Expected the reviewed six-record synthetic species plan')
    ids=[UUID(row['id']) for row in plan['changes']]
    source_id=UUID(plan['source_id'])
    local=ZoneInfo(config.TIMEZONE)
    with connect() as conn:
        source=conn.execute('SELECT * FROM sightings WHERE detection_id=%s',(source_id,)).fetchone()
        current=conn.execute('SELECT * FROM gewog_info WHERE gewog_code=%s',(source['gewog_code'],)).fetchone()
        neighbours=conn.execute('SELECT * FROM gewog_info WHERE gewog_code=ANY(%s) ORDER BY gewog_code',(current['neighbour_codes'],)).fetchall()
    with ThreadPoolExecutor(max_workers=2) as executor:
        pending=executor.submit(fetch_weather_batch,[current,*neighbours],source['timestamp']-timedelta(days=7),source['timestamp'])
        runtime=get_runtime()
        cache=pending.result()
    def weather(gewog,ts):
        return cache[(gewog['gewog_code'],ts.astimezone(local).strftime('%Y-%m-%dT%H:00'))]
    now=datetime.now(local)
    backup=config.ROOT/'data'/f'synthetic-risk-before-{now:%Y%m%d-%H%M%S}.json'
    with connect() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72645403)')
        source=conn.execute('SELECT * FROM sightings WHERE detection_id=%s FOR UPDATE',(source_id,)).fetchone()
        old=conn.execute('SELECT * FROM sightings WHERE detection_id=ANY(%s) ORDER BY detection_id FOR UPDATE',(ids,)).fetchall()
        if len(old)!=6 or any(row['camera_id']!='SYNTH-1306' or row['gewog_code']!=1306 for row in old):
            raise ValueError('Refusing to edit any record outside the reviewed synthetic Gelephu batch')
        old_predictions=conn.execute('SELECT * FROM predictions WHERE detection_id=%s ORDER BY nbr_code',(source_id,)).fetchall()
        old_alerts=conn.execute('SELECT * FROM app_alerts WHERE detection_id=%s FOR UPDATE',(source_id,)).fetchall()
        before=conn.execute("SELECT count(*) AS total,count(*) FILTER(WHERE (timestamp AT TIME ZONE 'Asia/Thimphu')::date=%s) AS today,count(*) FILTER(WHERE timestamp>=%s) AS within_24h FROM sightings WHERE camera_id LIKE 'SYNTH-%%'",(now.date(),now-timedelta(hours=24))).fetchone()
        conn.execute("UPDATE sightings SET species='Wild Boar' WHERE detection_id=ANY(%s)",(ids,))
        outputs=[]
        for neighbour in neighbours:
            rows=build_pair_rows(conn,source,current,neighbour,weather,runtime.min_encoder_length)
            low,present=runtime.predict(rows)
            outputs.append({'detection_id':source_id,'cur_code':current['gewog_code'],'nbr_code':neighbour['gewog_code'],
                'nbr_name':neighbour['gewog_name'],'p_low':low,'p_present':present,'risk_label':risk_label(present)})
        if not any(row['risk_label']=='LOW' for row in outputs) or not any(row['risk_label']=='HIGH' for row in outputs):
            raise ValueError('The real model did not produce the reviewed mixed-risk result; rolling back')
        with backup.open('x',encoding='utf-8') as stream:
            json.dump({'synthetic_sightings':old,'predictions':old_predictions,'alerts':old_alerts},stream,default=str,indent=2)
        for row in outputs:
            conn.execute('''INSERT INTO predictions(detection_id,cur_code,nbr_code,nbr_name,p_low,p_present,risk_label)
                VALUES (%(detection_id)s,%(cur_code)s,%(nbr_code)s,%(nbr_name)s,%(p_low)s,%(p_present)s,%(risk_label)s)
                ON CONFLICT(detection_id,nbr_code) DO UPDATE SET p_low=EXCLUDED.p_low,p_present=EXCLUDED.p_present,
                risk_label=EXCLUDED.risk_label,predicted_at=now()''',row)
        high=[row['nbr_code'] for row in outputs if row['risk_label']=='HIGH']
        for alert in old_alerts:
            conn.execute('UPDATE app_alerts SET affected_codes=%s,updated_at=now() WHERE id=%s',(high,alert['id']))
            pending=conn.execute("SELECT id,payload FROM app_outbox WHERE dedupe_key LIKE %s AND status IN ('pending','retry') FOR UPDATE",(f"alert:{alert['id']}:%",)).fetchall()
            for message in pending:
                payload=json.loads(cipher().decrypt(message['payload'].encode()))
                if 'affected_codes' in payload:payload['affected_codes']=high
                if 'allowed_codes' in payload:payload['allowed_codes']=[current['gewog_code'],*high]
                encrypted=cipher().encrypt(json.dumps(payload).encode()).decode()
                conn.execute('UPDATE app_outbox SET payload=%s WHERE id=%s',(encrypted,message['id']))
        after=conn.execute("SELECT count(*) AS total,count(*) FILTER(WHERE (timestamp AT TIME ZONE 'Asia/Thimphu')::date=%s) AS today,count(*) FILTER(WHERE timestamp>=%s) AS within_24h FROM sightings WHERE camera_id LIKE 'SYNTH-%%'",(now.date(),now-timedelta(hours=24))).fetchone()
        if before!=after or after['today']!=10:
            raise ValueError('Synthetic timestamp distribution changed; rolling back')
        audit(conn,None,'demo.synthetic_history_adjusted',source_id,{'profile':plan['profile'],'synthetic_records':len(old),
            'species':'Wild Boar','source_id':str(source_id),'neighbour_risks':{row['nbr_name']:row['risk_label'] for row in outputs}})
        snapshot=conn.execute("SELECT * FROM sightings WHERE camera_id LIKE 'SYNTH-%%' ORDER BY timestamp DESC,detection_id").fetchall()
    manifest=config.ROOT/'data/synthetic-20261029-sightings.csv'
    with manifest.open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(snapshot[0]));writer.writeheader();writer.writerows(snapshot)
    print(json.dumps({'source_id':source_id,'synthetic_records_changed':6,'synthetic_today':after['today'],
        'results':outputs,'backup':str(backup)},default=str,indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',required=True)
    parser.parse_args()
    apply()
