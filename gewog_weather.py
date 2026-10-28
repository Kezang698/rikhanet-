#!/usr/bin/env python3
"""
gewog_weather.py
Fetch current weather for the centroid of each gewog and append it to gewog_weather.xlsx.

Input : gewogs_info.xlsx (sheet 'gewogs_info': Gewog Code, Gewog Name, Centroid Longitude, Centroid Latitude)
Output: gewog_weather.xlsx (sheet 'gewog_weather'), one block of 17 rows appended per run,
        so scheduling the script builds a time series.

Data source: Open-Meteo forecast API (free, no key). https://open-meteo.com
  - temperature, humidity, precipitation: model values at the centroid (current hour)
  - elevation: Open-Meteo's DEM elevation (~90 m grid) at the centroid
  - daily precipitation: total forecast/observed for today (local time)

Requirements: pip install requests openpyxl
Usage:        python gewog_weather.py [--info gewogs_info.xlsx] [--out gewog_weather.xlsx]
Schedule:     see the bottom of this file.
"""
import argparse
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

API_URL = "https://api.open-meteo.com/v1/forecast"
TIMEZONE = "Asia/Thimphu"
SHEET = "gewog_weather"
HEADERS = [
    "Timestamp (Bhutan time)", "Gewog Code", "Gewog Name",
    "Latitude", "Longitude", "Elevation (m)",
    "Temperature (°C)", "Relative Humidity (%)",
    "Precipitation, current hour (mm)", "Precipitation, today total (mm)",
]
RETRIES = 3

log = logging.getLogger("gewog_weather")


def read_centroids(path: Path):
    wb = load_workbook(path, data_only=True, read_only=True)
    ws = wb["gewogs_info"]
    rows = list(ws.iter_rows(values_only=True))
    head = [str(h).strip() if h else "" for h in rows[0]]
    idx = {name: head.index(name) for name in
           ("Gewog Code", "Gewog Name", "Centroid Longitude", "Centroid Latitude")}
    out = []
    for r in rows[1:]:
        code = r[idx["Gewog Code"]]
        if not isinstance(code, (int, float)):   # skips the Total row and notes
            continue
        out.append({
            "code": int(code),
            "name": r[idx["Gewog Name"]],
            "lat": float(r[idx["Centroid Latitude"]]),
            "lon": float(r[idx["Centroid Longitude"]]),
        })
    if not out:
        raise ValueError("No gewogs found in %s" % path)
    return out


def fetch_weather(gewogs):
    """One request for all gewogs; Open-Meteo returns a list in the same order."""
    params = {
        "latitude": ",".join(str(g["lat"]) for g in gewogs),
        "longitude": ",".join(str(g["lon"]) for g in gewogs),
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "precipitation_sum",
        "forecast_days": 1,
        "timezone": TIMEZONE,
    }
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            resp = requests.get(API_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):           # single location returns a dict
                data = [data]
            if len(data) != len(gewogs):
                raise ValueError("API returned %d locations, expected %d" % (len(data), len(gewogs)))
            return data
        except (requests.RequestException, ValueError) as e:
            last_err = e
            log.warning("Attempt %d/%d failed: %s", attempt, RETRIES, e)
            time.sleep(5 * attempt)
    raise RuntimeError("Weather request failed after %d attempts: %s" % (RETRIES, last_err))


def build_rows(gewogs, data):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    rows = []
    for g, d in zip(gewogs, data):
        cur = d.get("current", {})
        daily = d.get("daily", {}).get("precipitation_sum", [None])
        rows.append([
            now, g["code"], g["name"], g["lat"], g["lon"], d.get("elevation"),
            cur.get("temperature_2m"), cur.get("relative_humidity_2m"),
            cur.get("precipitation"), daily[0] if daily else None,
        ])
    return rows


def write_rows(path: Path, rows):
    if path.exists():
        wb = load_workbook(path)
        ws = wb[SHEET] if SHEET in wb.sheetnames else wb.create_sheet(SHEET)
    else:
        wb = Workbook()
        ws = wb.active
        ws.title = SHEET
    if ws.max_row == 1 and ws.cell(1, 1).value is None:   # new/empty sheet: write header
        for i, h in enumerate(HEADERS, 1):
            ws.cell(1, i, h)
        for c in ws[1]:
            c.font = Font(name="Arial", bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="1F4E78")
            c.alignment = Alignment(wrap_text=True, vertical="center")
        for col, w in zip("ABCDEFGHIJ", [22, 12, 18, 11, 11, 13, 16, 18, 22, 22]):
            ws.column_dimensions[col].width = w
        ws.freeze_panes = "A2"
    for r in rows:
        ws.append(r)
        for c in ws[ws.max_row]:
            c.font = Font(name="Arial")
    wb.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--info", default="gewogs_info.xlsx", help="input workbook with centroids")
    ap.add_argument("--out", default="gewog_weather.xlsx", help="output workbook (appended on each run)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    gewogs = read_centroids(Path(args.info))
    log.info("Loaded %d gewog centroids", len(gewogs))
    rows = build_rows(gewogs, fetch_weather(gewogs))
    write_rows(Path(args.out), rows)
    log.info("Wrote %d rows to %s", len(rows), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

# ---------------------------------------------------------------------------
# SCHEDULING
# Linux/macOS (cron), every 3 hours:
#   0 */3 * * *  cd /path/to/folder && /usr/bin/python3 gewog_weather.py >> gewog_weather.log 2>&1
# Windows (Task Scheduler): create a task running
#   python C:\path\to\gewog_weather.py --info C:\path\gewogs_info.xlsx --out C:\path\gewog_weather.xlsx
# ---------------------------------------------------------------------------
