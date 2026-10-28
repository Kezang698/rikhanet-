"""Explore synthetic history scenarios without committing data or altering risk outputs.

All trials roll back. Only the original SYNTH- batch is touched in a transaction.
The model, source image, real sightings, weather provider and thresholds are fixed.
"""
import csv
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo
from .db import connect
from .features import build_pair_rows
from .tft_runtime import get_runtime
from .enrichment import fetch_weather_batch
from .inference import risk_label
from . import config


def explore():
    manifest=config.ROOT/'data/synthetic-20261029-sightings.csv'
    with manifest.open(newline='',encoding='utf-8') as stream:
        ids=[UUID(row['detection_id']) for row in csv.DictReader(stream)]
    local=ZoneInfo(config.TIMEZONE)
    now=datetime.now(local)
    with connect() as conn:
        trigger=conn.execute("SELECT * FROM sightings WHERE camera_id NOT LIKE 'SYNTH-%%' AND gewog_code=1312 AND discarded=FALSE ORDER BY timestamp DESC LIMIT 1").fetchone()
        current=conn.execute('SELECT * FROM gewog_info WHERE gewog_code=%s',(trigger['gewog_code'],)).fetchone()
        neighbours=conn.execute('SELECT * FROM gewog_info WHERE gewog_code=ANY(%s) ORDER BY gewog_code',(current['neighbour_codes'],)).fetchall()
        original=conn.execute('SELECT * FROM sightings WHERE detection_id=ANY(%s) ORDER BY gewog_code,timestamp DESC',(ids,)).fetchall()
        if len(original)!=102 or any(not row['camera_id'].startswith('SYNTH-') for row in original):
            raise ValueError('Expected the original 102 synthetic records')
    start=now-timedelta(days=7)
    with ThreadPoolExecutor(max_workers=2) as executor:
        weather_future=executor.submit(fetch_weather_batch,[current,*neighbours],start,trigger['timestamp'])
        runtime=get_runtime()
        cache=weather_future.result()
    print('Source:',trigger['detection_id'],'real weather hours:',len(cache),flush=True)
    def weather(gewog,ts):
        key=(gewog['gewog_code'],ts.astimezone(local).strftime('%Y-%m-%dT%H:00'))
        return cache[key]
    def predictions(conn):
        results=[]
        for neighbour in neighbours:
            rows=build_pair_rows(conn,trigger,current,neighbour,weather,runtime.min_encoder_length)
            low,present=runtime.predict(rows)
            results.append({'nbr_code':neighbour['gewog_code'],'name':neighbour['gewog_name'],'p_present':present,'p_low':low,'risk_label':risk_label(present)})
        return results
    profiles=[('quiet_gelephu_other_wildlife','gelephu_species',None),('baseline',None,None),('quiet_neighbours','elsewhere',None),('active_source','source',None),('active_uml','uml',None)]
    for elevation in (200,500,1200,2000):
        profiles.append((f'quiet_history_elev_{elevation}','elsewhere',elevation))
        profiles.append((f'active_source_elev_{elevation}','source',elevation))
    results=[]
    for name,pattern,elevation in profiles:
        with connect() as conn:
            changes=[]
            if pattern == 'gelephu_species':
                changes=[{'id':row['detection_id'],'species':'Wild Boar'} for row in original if row['gewog_code']==1306]
                with conn.cursor() as cursor:
                    cursor.executemany('UPDATE sightings SET species=%(species)s WHERE detection_id=%(id)s',changes)
            elif pattern:
                if pattern=='elsewhere':
                    candidates=[row for row in original if row['gewog_code'] not in [current['gewog_code'],*current['neighbour_codes']]]
                elif pattern=='source':
                    candidates=[row for row in original if row['gewog_code']==current['gewog_code']]+[row for row in original if row['gewog_code'] not in current['neighbour_codes'] and row['gewog_code']!=current['gewog_code']]
                else:
                    candidates=[row for row in original if row['gewog_code'] in (1312,1315)]
                today_ids={row['detection_id'] for row in candidates[:10]}
                old_index=today_index=0
                midnight=trigger['timestamp'].astimezone(local).replace(hour=0,minute=0,second=0,microsecond=0)
                span=trigger['timestamp'].astimezone(local)-midnight-timedelta(minutes=1)
                for row in original:
                    if row['detection_id'] in today_ids:
                        today_index+=1
                        timestamp=midnight+span*(today_index/11)
                    else:
                        timestamp=trigger['timestamp']-timedelta(hours=25+old_index*130/91)
                        old_index+=1
                    updates={'id':row['detection_id'],'timestamp':timestamp,
                        'sight_elev':elevation if elevation is not None and row['gewog_code']==1312 else row['sight_elev'],
                        'cur_temp':row['cur_temp'],'cur_hum':row['cur_hum'],'cur_precip':row['cur_precip']}
                    changes.append(updates)
                with conn.cursor() as cursor:
                    cursor.executemany('UPDATE sightings SET timestamp=%(timestamp)s,sight_elev=%(sight_elev)s WHERE detection_id=%(id)s',changes)
            try:
                output=predictions(conn)
                print(name,[(row['name'],round(row['p_present']*100,1),row['risk_label']) for row in output],flush=True)
                results.append({'profile':name,'changes':changes,'predictions':output})
            finally:
                conn.rollback()
            if any(row['risk_label']=='LOW' for row in output) and any(row['risk_label']!='LOW' for row in output):
                path=config.ROOT/'data/synthetic-mixed-risk-plan.json'
                path.write_text(json.dumps({'source_id':str(trigger['detection_id']),'profile':name,'changes':changes,'predictions':output},default=str,indent=2),encoding='utf-8')
                print('Mixed-risk plan:',path,flush=True)
                return
    path=config.ROOT/'data/synthetic-risk-exploration.json'
    path.write_text(json.dumps(results,default=str,indent=2),encoding='utf-8')
    print('No mixed-risk profile found. All trials rolled back.',flush=True)


if __name__=='__main__':
    explore()
