# RiKhaNET frontend prototype

This project recreates the 21 screens in the supplied WEBAPP.docx as a runnable Next.js frontend: one shared login, twelve admin views and eight ranger views. The screens use the document's green visual style, original wildlife artwork, real Gelephu map tiles and browser demonstration data.

## Gewogs as zones — 27 October 2026

The four illustrative zones (GE-1 to GE-4) are replaced by the 17 real gewogs of the Gelephu Mindfulness City area (from `GMC_Gewogs`). A zone is now a gewog, identified by its gewog code.

- `lib/gewogs.ts` holds the boundaries, converted from Web Mercator to latitude/longitude and simplified (about 25 m, 81 KB). Ngangla is marked partial (about 25% inside the GMC).
- The map draws every gewog polygon with its name. Large gewogs are always labelled; small ones appear from zoom level 10. Click a polygon or name for its code and area. Predictions colour each gewog by demonstration risk.
- Sample sightings, cameras and alerts are spread over all 17 gewogs. Sample positions are always inside the gewog; a sighting from a camera sits in that camera's gewog. Risk values are still demonstration data.
- Rangers see only the gewogs the admin assigns, on every page and on the map. The admin assigns gewogs with checkboxes in **Rangers > Edit Details**. The demo ranger login (Tashi Dorji) is staff record RNG-009. A ranger with no gewog sees empty lists.
- Filters, tables, reports, predictions and the CSV import use gewog names. The import `zone` column accepts a gewog name or code (`public/sample-sightings.csv` updated).
- Saved browser data is now stored under `rikhanet-demo-v2`. Data saved with the old GE zones is ignored, so the demo starts fresh once.

## Real Gelephu maps and responsive layouts — 26 October 2026

The map pictures have been replaced with interactive Leaflet maps using OpenStreetMap street tiles, centred on Gelephu (26.87056 N, 90.48556 E). This shared map is used in both roles' Overview, Wildlife Map, Predictions and Cameras pages, plus admin Zones & Rules. Wildlife photographs retain the supplied prototype artwork.

- Drag to pan; pinch on touchscreens or use the zoom buttons. Mouse-wheel scrolling continues to scroll the page.
- Reset returns to Gelephu. Fit visible results brings the currently enabled records and sectors into view.
- Open Map layers to show or hide sightings, online/offline cameras and illustrative monitoring sectors.
- Select a marker to open its information. Sighting and camera popup buttons select the matching record. Sightings at the same position are grouped into one numbered marker with a list of records.
- Wildlife Map filters now update actual markers. Camera filters update camera markers. Ranger overlays are restricted to GE-1 and GE-2 records.
- Prediction sector colours and forecast badges share the red/high, yellow/medium and blue/low scale; the demonstration risk values are unchanged.
- The map adapts to its container with ResizeObserver. The navigation becomes a drawer on tablets and phones; forms, cards and filters wrap; wide tables scroll within their own containers. Touch inputs use 16 px text and larger controls. Breakpoints support narrow phones, tablets, laptops and wider monitors.

**Real map versus demonstration data:** streets and geography come from OpenStreetMap. The existing wildlife records, camera reporting status, risk values and GE sector circles are still demonstration data. Sector circles are explicitly labelled illustrative and are not official administrative or GMC boundaries. Existing records without GPS use marked sample positions or their camera location; no official zone geometry has been invented. Enter camera latitude and longitude in **Cameras > Edit Camera** to place that camera at the entered coordinates. Sighting records also accept optional numeric `lat` and `lng` fields when supplied by a future data integration. Actual wildlife GPS, official GeoJSON boundaries and live feeds must be connected separately.

The default map requires internet but no API key. Tile failures show a retry message. Attribution remains visible; the app does not pre-download tiles or offer offline map downloads. Optional provider configuration is documented in `.env.example` and `lib/maps.ts`.

After extracting the updated archive, stop the old server with Ctrl+C, open the inner `rikhanet-ui` folder and run:

```powershell
npm.cmd ci
npm.cmd run dev
```

New source files: `components/GelephuMap.tsx`, `lib/maps.ts`, `app/maps.css`, `app/responsive.css`, `.env.example`. The shared map wrapper, map pages, seed coordinates, layout imports, navigation accessibility and dependency lockfile were updated. Existing severity colours, profile editing and single-date ranger headers are preserved.

Validation: TypeScript, production compilation and map-coordinate checks cover demo positions, all seeded sightings, legacy camera data, entered GPS values and invalid coordinates. Browser/device visual verification is unavailable in this environment: the managed preview launcher supplies `--host` and `--strictPort`, which Next.js does not accept. Run the app locally to verify live tile loading, touch gestures and layouts on your target devices. Prior account/header test results below describe earlier revisions, not a new browser test of this map update.

Map references: [Leaflet documentation](https://leafletjs.com/reference.html), [OpenStreetMap tile usage](https://operations.osmfoundation.org/policies/tiles/), [OpenStreetMap attribution](https://www.openstreetmap.org/copyright).

## Editable accounts update — 26 October 2026

Admin and ranger My Account pages now share the same card layout, initials avatar, role badge, Security Settings, Password Recovery, notification switches and Recent Account Activity. Ranger-specific notification options, assigned zones and account information remain available. The single page date, severity colours and shared fonts are preserved.

Open **My Account > Edit Profile**, change the full name, contact email or optional phone number, then choose **Save changes**. **Cancel**, Escape and closing the dialog discard unsaved changes. A saved name immediately updates the top-bar name and initials. **Update Recovery Email** also saves the recovery contact for that role. Profiles and notification settings are independent for admin and ranger and persist in this browser after refreshing or signing out.

The update adds default profiles to older saved demonstration data without resetting observations, alerts, staff, rules or preferences. Role, assigned zones, account-created dates and login history are system-managed. The displayed activity history remains illustrative. Editing contact details does not change the demo sign-in emails or passwords; password changes and 2FA remain UI previews.

If applying this update to your existing source folder, compare these files: `components/management.tsx`, `components/RiKhaNET.tsx`, `lib/data.ts`, `app/theme.css`, and this guide. Dependencies are unchanged. Restart the app with `npm.cmd run dev` from the inner `rikhanet-ui` folder.

Verified with TypeScript and a production build, plus browser checks for saving, cancelling, validation, separate profiles, recovery contacts, notification settings, refreshing and signing in again. Existing saved records are retained. Both account pages and edit dialogs were inspected at desktop and mobile sizes, including long contact details.

## Ranger header update — 26 October 2026

All eight ranger pages now show one date beside the page title. The duplicate date in the green top bar has been replaced with a circular TD avatar and Tashi Dorji, matching the admin profile styling. Clicking it opens My Account; on small screens the avatar remains visible. Predictions keeps the generation time beside the single page date. Observation timestamps and date filters are unchanged.

This revision changes only `components/RiKhaNET.tsx`, `components/ui.tsx` and `components/monitoring.tsx`, plus this guide. It preserves the previous colour and typography update, dependencies, data and page layouts. The header and profile navigation were checked on every ranger page at desktop and mobile widths; the admin Alerts screenshot remained identical.

## Colour and typography update — 26 October 2026

Alert severity now uses the same shared `Severity` component in admin tables, ranger lists, detail headers, detail fields and ranger report history:

| Severity | Accent | Background | Text |
| --- | --- | --- | --- |
| High | Red `#DC2626` | `#FEE2E2` | `#991B1B` |
| Medium | Yellow `#EAB308` | `#FEF9C3` | `#854D0E` |
| Low | Blue `#2563EB` | `#DBEAFE` | `#1E40AF` |

Each badge includes its severity name and an icon. Dark text on a light tinted background keeps the label readable. Selecting an alert uses the green selection style and does not change its severity colour. Primary actions and active tabs use the same green styling in both roles.

Editable interface text uses Arial, with Helvetica and sans-serif fallbacks. The shared type scale is 30–24 px for page headings, 18 px for card headings, 14 px for body text, 13 px for controls and tables, and 12 px for captions and badges. Hero branding and summary numbers retain their larger display styles. Original map/photo artwork remains unchanged.

The tokens and shared styles are in `app/theme.css`, imported after `app/globals.css`. Future severity colour changes should be made there; render severity with `<Severity value={alert.severity} />` instead of separate conditional colour choices on each page.

The update also pins Next.js 16.4.3 and refreshes its lockfile after the build flagged the earlier version. No backend has been added.

To run this revision separately, stop your previous development server with Ctrl+C, extract the archive into a new folder, open the inner `rikhanet-ui` folder in VS Code, then run:

```powershell
npm.cmd ci
npm.cmd run dev
```

If you are merging into an edited copy, compare these files rather than replacing the whole project: `app/theme.css` (new), `app/globals.css`, `app/layout.tsx`, `components/ui.tsx`, `components/monitoring.tsx`, `components/management.tsx`, `package.json`, and `package-lock.json`. Run `npm.cmd ci` after updating the dependency files.

## Start on Windows

Use PowerShell. Commands ending in `npm.cmd` avoid the Windows `npm.ps1` execution-policy error.

1. Install Node.js 24 LTS if it is not installed. On 64-bit Windows, these commands download the official installer and open the installation wizard:

```powershell
$nodeInstaller = Join-Path $env:TEMP "node-v24.21.0-x64.msi"
Invoke-WebRequest -Uri "https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi" -OutFile $nodeInstaller
Start-Process -FilePath msiexec.exe -ArgumentList "/i `"$nodeInstaller`"" -Wait
```

Follow the installer, then close and reopen PowerShell. For an ARM-based Windows machine, use the appropriate installer at https://nodejs.org/en/download.

2. Download `RiKhaNET-UI.zip` into your Downloads folder, keeping that filename.
3. Run these commands one at a time:

```powershell
node --version
npm.cmd --version

$zipPath = Join-Path $env:USERPROFILE "Downloads\RiKhaNET-UI.zip"
$projectParent = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "RiKhaNET-Prototype"
if (!(Test-Path $zipPath)) { throw "Download RiKhaNET-UI.zip into your Downloads folder first." }
if (Test-Path $projectParent) { throw "RiKhaNET-Prototype already exists. Choose a new folder name in the projectParent command." }
Expand-Archive -LiteralPath $zipPath -DestinationPath $projectParent
Set-Location (Join-Path $projectParent "rikhanet-ui")
npm.cmd ci
npm.cmd run dev
```

4. Wait for `Ready`, then open http://localhost:3000 in your browser. Keep PowerShell open while using the app. If Next.js reports a different port, open the address it prints.
5. Sign in with one of the demo accounts below.

The archive already contains the application source. Do not run `create-next-app` over this folder.

## Demo sign-in

| Role   | Email              | Password |
| ------ | ------------------ | -------- |
| Admin  | admin@rikhanet.bt  | Demo@123 |
| Ranger | ranger@rikhanet.bt | Demo@123 |

These are frontend demonstration credentials. No backend authentication, real staff account, database or AI service is connected. Role menus demonstrate the intended UX; they do not provide production authorization.

## Open and edit the project

With VS Code installed, run the following in the project folder:

```powershell
code .
```

If `code` is unavailable, open VS Code and choose File > Open Folder > Documents > RiKhaNET-Prototype > rikhanet-ui.

| File                        | What to edit                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| `app/globals.css`           | Colours, spacing, typography, grid layout and responsive rules     |
| `app/login/`                | Sign-in route (`/login`)                                           |
| `app/[role]/<page>/`        | One folder per page; each `page.tsx` holds that page's code and serves both `/admin/<page>` and `/ranger/<page>` |
| `components/filters.tsx`    | Zone/species selects and visible-sightings hook shared by several pages |
| `components/AppProvider.tsx`| Role, saved demo state, dialogs and toasts shared across routes    |
| `components/Shell.tsx`      | Sidebar, topbar, role guard and page titles, used by `app/[role]/layout.tsx`|
| `components/LoginScreen.tsx`| Login form                                                         |
| `components/monitoring.tsx` | Overview, Sightings, Wildlife Map, Predictions, Alerts and Cameras |
| `components/management.tsx` | Reports, Data Review, Rangers, Rules, Settings and My Account      |
| `components/ui.tsx`         | Shared cards, map viewports, badges, photo views and controls      |
| `lib/data.ts`               | Demonstration records, types and CSV export                        |
| `public/artwork/`           | Unmodified artwork extracted from the supplied document            |

Saving a code change while the development server runs refreshes the app.

## Restart next time

```powershell
Set-Location (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "RiKhaNET-Prototype\rikhanet-ui")
npm.cmd run dev
```

For local Webcam inference, install Python and the packages listed in `inference/requirements.txt`. On Windows, run these commands from the project folder:

```powershell
python -m venv inference/.venv
inference\.venv\Scripts\python.exe -m pip install --upgrade pip
inference\.venv\Scripts\python.exe -m pip install -r inference/requirements.txt
```

The inference endpoint loads `best.pt` from the project root and runs it with Ultralytics YOLO on the same machine as the Next.js server. If Python is not on PATH or you want a different interpreter, set `RIKHANET_PYTHON` to its executable path before starting Next.js. No inference API key or external inference service is used.

Press Ctrl+C in the terminal to stop the app. Dependencies need to be installed only the first time, or after a dependency change.

## All screens

| Admin         | Ranger       |
| ------------- | ------------ |
| Overview      | Overview     |
| Sightings     | Sightings    |
| Wildlife Map  | Wildlife Map |
| Predictions   | Predictions  |
| Alerts        | Alerts       |
| Cameras       | Cameras      |
| Reports       | Reports      |
| Data Review   | My Account   |
| Rangers       |              |
| Zones & Rules |              |
| Settings      |              |
| My Account    |              |

The sidebar changes by role. Ranger records are limited to GE-1 and GE-2. Each page has its own URL such as `/admin/sightings`, so browser back/forward and page reloads work normally.

## Working demo interactions

- Open summary cards and activity items to navigate to the related view.
- Filter sightings by text, species, source, zone, date and review status; select records and paginate.
- Review existing sightings and save audit notes. Rangers can flag an issue or record a field sighting.
- Pan and zoom the real Gelephu basemap, filter its markers, toggle layers and open related sightings or cameras.
- Acknowledge alerts, assign rangers, save a response and resolve alerts. Ranger responses are visible after signing into the admin demo in the same browser.
- Register or edit demo camera sources, and filter reporting status.
- Add or edit local ranger records and deactivate/reactivate them.
- Edit alert rules and toggle them, with local change history.
- Filter and generate report charts from demo records. Export CSV, or use Export PDF and choose Save as PDF in the browser print dialog.
- Import observation CSV files with validation. A sample file is in `public/sample-sightings.csv` and can also be downloaded in Data Review.
- Preview your own image uploads. They remain marked Awaiting AI backend; the frontend does not invent detections for them.
- Open the Webcam page to continuously track elephants from the browser webcam with the local `best.pt` YOLO model, or upload an image for a single check. Live boxes update as frames are processed; a detection is saved to Sightings for review when an elephant first appears.
- Change notification preferences and view sample system information.
- Edit each role's name, contact email, phone number and recovery contact in My Account; changes persist locally and update the profile header.

Data Review saves imported observations automatically. The separate optional approve/reject controls on Sightings follow that page in the supplied document. There is no approval gate in Data Review.

## What remains illustrative

This is a reconstruction from images, not exported Figma design tokens or original UI source. It matches the page structure, colours, visual hierarchy and major controls; it is not a guarantee of pixel-for-pixel identity across browsers and screen sizes.

Maps use real OpenStreetMap geographic tiles with interactive markers. Sector circles and records without supplied coordinates remain clearly labelled demonstration overlays. Official boundaries and live wildlife feeds are not connected. No API key is needed for the default basemap.

The original document mixes April 2025/September 2026 dates and Zone A–D/GE-1–GE-4 labels. This implementation uses 28 September 2026 and GE-1–GE-4 consistently with the majority of screens and the role descriptions. Charts and counts reflect the demo records and can differ from the static screenshot totals after filtering or editing.

Forecasts retain the document's 72%, 58%, 28% and 16% demonstration values. The Webcam page runs a persistent local Ultralytics YOLO worker and samples webcam video continuously, displaying tracked elephant boxes over the preview. It does not connect to registered CCTV devices. TFT forecasting, email or SMS sending, GIS boundary editor, account provisioning, password change or 2FA activation is not implemented. Related forms clearly identify when they are only previews.

Records, profile details and notification preferences are saved in this browser's localStorage; role sign-in is held in sessionStorage. New image previews last only while the current tab stays open. Use Settings > Reset demonstration data to restore the initial records and profiles. This does not delete source files.

## Build checks

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

The first two commands verify TypeScript and compile the production application. `start` serves the production build. Use Ctrl+C to stop any existing server before using `start` on the same port.

If port 3000 is busy:

```powershell
npm.cmd run dev -- --port 3001
```

Then open http://localhost:3001.

## Versions and sources

Next.js 16.4.3, React 19.3.0, TypeScript 7.0.2, Lucide React 1.54.0, Recharts 3.10.1 and Leaflet 1.9.4. Exact dependency versions and the lockfile are included. The project supports Node 22 or later; Node 24 LTS is recommended.

Official setup reference: https://nextjs.org/docs/app/getting-started/installation

Design sources: the supplied `WEBAPP.docx` and `Group_9_RiKhaNET_Proposal.pdf`. The packaged artwork is reused from those user-supplied prototype images; no third-party image fetching is required at runtime.
