import { demoCoordinates } from "./maps";

export type Role = "admin" | "ranger";
export type View =
  | "overview"
  | "sightings"
  | "map"
  | "predictions"
  | "alerts"
  | "cameras"
  | "reports"
  | "review"
  | "rangers"
  | "rules"
  | "settings"
  | "account";
export type Zone = "GE-1" | "GE-2" | "GE-3" | "GE-4";
export const ZONES: Record<Zone, string> = {
  "GE-1": "Gelephu Core",
  "GE-2": "East Corridor",
  "GE-3": "South Riverside",
  "GE-4": "North Forest",
};
export const SPECIES = [
  "Asian Elephant",
  "Wild Boar",
  "Leopard",
  "Barking Deer",
  "Gaur",
  "Sambar Deer",
  "Tiger (indicative)",
];
export const TODAY = "2026-09-28";
export const DATE_LABEL = "28 Sep 2026";
export type Review =
  | "Needs review"
  | "Approved"
  | "Rejected"
  | "Automatically saved";
export interface Sighting {
  id: string;
  species: string;
  date: string;
  time: string;
  zone: Zone;
  camera: string;
  confidence: number;
  review: Review;
  source: string;
  note: string;
  flagged?: boolean;
  lat?: number;
  lng?: number;
}
export interface AlertRecord {
  id: string;
  species: string;
  zone: Zone;
  severity: "High" | "Medium" | "Low";
  date: string;
  time: string;
  trigger: string;
  status: "New" | "Acknowledged" | "Resolved";
  ranger: string;
  response: string;
  timeline: string[];
}
export interface CameraRecord {
  id: string;
  zone: Zone;
  status: "Online" | "Offline";
  time: string;
  source: string;
  lat: string;
  lng: string;
  locationSource?: "demo" | "recorded";
}
export interface RangerRecord {
  id: string;
  name: string;
  role: string;
  zones: Zone[];
  status: "Active" | "Suspended";
  email: string;
  phone: string;
  notes: string;
}
export interface Rule {
  id: string;
  name: string;
  distance: number;
  enabled: boolean;
  kind: "distance" | "repeat";
  severity: string;
  recipients: string;
  history: string[];
}
export interface Batch {
  id: string;
  source: string;
  uploaded: string;
  total: number;
  processed: number;
  status: string;
}
export interface AccountProfile {
  name: string;
  email: string;
  phone: string;
  recoveryEmail: string;
}

export function defaultProfiles(): Record<Role, AccountProfile> {
  return {
    admin: {
      name: "Admin User",
      email: "admin@rikhanet.bt",
      phone: "",
      recoveryEmail: "admin@rikhanet.bt",
    },
    ranger: {
      name: "Tashi Dorji",
      email: "tashi.dorji@rikhanet.bt",
      phone: "+975 17 234 567",
      recoveryEmail: "tashi.dorji@rikhanet.bt",
    },
  };
}

export function profileInitials(name: string) {
  if (name === "Admin User") return "AD";
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`.toUpperCase()
    : Array.from(words[0] ?? "").slice(0, 2).join("").toUpperCase();
}

export interface DemoState {
  sightings: Sighting[];
  alerts: AlertRecord[];
  cameras: CameraRecord[];
  rangers: RangerRecord[];
  rules: Rule[];
  batches: Batch[];
  preferences: Record<string, boolean>;
  profiles: Record<Role, AccountProfile>;
  config: { threshold: number; advisory: number; interval: number };
}

export function seedState(): DemoState {
  const initial: Array<[string, string, Zone, string, number, Review]> = [
    ["Asian Elephant", "06:24", "GE-2", "CAM-012", 0.92, "Needs review"],
    ["Wild Boar", "05:11", "GE-1", "CAM-003", 0.87, "Approved"],
    ["Leopard", "04:17", "GE-4", "CAM-028", 0.88, "Approved"],
    ["Barking Deer", "02:53", "GE-1", "CAM-018", 0.81, "Needs review"],
    ["Asian Elephant", "21:36", "GE-2", "CAM-012", 0.89, "Approved"],
    ["Gaur", "18:02", "GE-3", "CAM-021", 0.65, "Rejected"],
    ["Sambar Deer", "16:11", "GE-1", "CAM-007", 0.83, "Approved"],
    ["Asian Elephant", "11:04", "GE-2", "CAM-015", 0.86, "Approved"],
    ["Leopard", "23:47", "GE-1", "CAM-018", 0.79, "Needs review"],
    ["Wild Boar", "19:20", "GE-1", "CAM-003", 0.78, "Approved"],
  ];
  const sightings: Sighting[] = initial.map((r, i) => ({
    id: `S-${String(i + 1).padStart(3, "0")}`,
    species: r[0],
    time: r[1],
    zone: r[2],
    camera: r[3],
    confidence: r[4],
    review: r[5],
    date: TODAY,
    source: "Camera trap",
    note: "",
  }));
  for (let i = 10; i < 247; i++)
    sightings.push({
      id: `S-${String(i + 1).padStart(3, "0")}`,
      species: SPECIES[i % SPECIES.length],
      date: `2026-09-${String(27 - Math.floor((i - 10) / 40)).padStart(2, "0")}`,
      time: `${String(i % 24).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
      zone: (["GE-1", "GE-2", "GE-3", "GE-4"] as Zone[])[i % 4],
      camera: `CAM-${String((i % 28) + 1).padStart(3, "0")}`,
      confidence: Number((0.64 + (i % 34) / 100).toFixed(2)),
      review: i < 71 ? "Needs review" : "Approved",
      source: i % 11 === 0 ? "Ranger report" : "Camera trap",
      note: "",
    });
  const alerts: AlertRecord[] = Array.from({ length: 29 }, (_, i) => ({
    id: `A-${String(i + 1).padStart(3, "0")}`,
    species: i === 0 || i === 2 ? "Asian Elephant" : SPECIES[i % 6],
    zone: (["GE-2", "GE-4", "GE-2", "GE-1", "GE-3", "GE-4", "GE-2"] as Zone[])[
      i % 7
    ],
    severity:
      i === 10
        ? "Low"
        : (
            [
              "High",
              "Medium",
              "High",
              "Medium",
              "Low",
              "Medium",
              "Low",
            ] as const
          )[i % 7],
    date: TODAY,
    time: initial[i % 10][1],
    trigger:
      i === 0
        ? "Detected within settlement buffer (2 km)"
        : i === 2
          ? "Multiple detections"
          : i === 3
            ? "Movement trend"
            : "Camera detection",
    status: i < 7 ? "New" : i < 11 ? "Acknowledged" : "Resolved",
    ranger: i === 0 ? "Tashi Dorji" : "Karma Dorji",
    response: i >= 11 ? "Patrol completed. No further activity reported." : "",
    timeline: [
      "Alert generated (demo camera detection)",
      ...(i >= 7 ? ["Alert acknowledged"] : []),
      ...(i >= 11 ? ["Ranger response recorded", "Alert resolved"] : []),
    ],
  }));
  const cameraIds = [12, 3, 1, 15, 18, 21, 7, 28];
  const cameras: CameraRecord[] = Array.from({ length: 42 }, (_, i) => ({
    id: `CAM-${String(i < 8 ? cameraIds[i] : 50 + i).padStart(3, "0")}`,
    zone: (
      ["GE-2", "GE-1", "GE-1", "GE-2", "GE-2", "GE-3", "GE-3", "GE-4"] as Zone[]
    )[i % 8],
    status: i === 0 || i > 36 ? "Offline" : "Online",
    time: initial[i % 10][1],
    source: "Recorded (demo)",
    lat: "27.0285",
    lng: "90.4791",
  }));
  const names = [
    "Karma Dorji",
    "Sonam Tobgay",
    "Ugyen Norbu",
    "Thinley Penjor",
    "Pema Tshering",
    "Tashi Lhamo",
    "Kinley Wangdi",
    "Dorji Wangchuk",
  ];
  for (const camera of cameras) {
    const [lat, lng] = demoCoordinates(camera.zone, camera.id);
    camera.lat = String(lat);
    camera.lng = String(lng);
    camera.locationSource = "demo";
  }
  const assigned: Zone[][] = [
    ["GE-1"],
    ["GE-1", "GE-2"],
    ["GE-2"],
    ["GE-2", "GE-4"],
    ["GE-3"],
    ["GE-3"],
    ["GE-4"],
    ["GE-4"],
  ];
  const rangers: RangerRecord[] = names.map((name, i) => ({
    id: `RNG-${String(i + 1).padStart(3, "0")}`,
    name,
    role:
      i === 1 || i === 6
        ? "Senior Ranger"
        : i === 3
          ? "Camera Technician"
          : "Field Ranger",
    zones: assigned[i],
    status: i === 5 ? "Suspended" : "Active",
    email: name.toLowerCase().replace(" ", ".") + "@rikhanet.bt",
    phone: `+975 17 234 56${i}`,
    notes:
      i === 0
        ? "Experienced field ranger. Conducts regular camera maintenance in GE-1."
        : "",
  }));
  return {
    sightings,
    alerts,
    cameras,
    rangers,
    rules: [
      {
        id: "R-001",
        name: "Elephant near settlement",
        distance: 2,
        enabled: true,
        kind: "distance",
        severity: "High",
        recipients: "Rangers (GE-1, GE-2), Admin Team",
        history: [
          "28 Sep 2026, 06:24 — Rule created by Admin",
          "28 Sep 2026, 10:15 — Recipients updated by Admin",
          "27 Sep 2026, 16:40 — Condition changed by Admin",
        ],
      },
      {
        id: "R-002",
        name: "Repeated wildlife detections",
        distance: 5,
        enabled: true,
        kind: "repeat",
        severity: "Medium",
        recipients: "Rangers (relevant zone), Admin Team",
        history: ["28 Sep 2026 — Rule created by Admin"],
      },
    ],
    batches: [
      {
        id: "B-2026-0928-01",
        source: "Camera images",
        uploaded: "28 Sep 2026 06:30",
        total: 120,
        processed: 120,
        status: "Saved",
      },
      {
        id: "B-2026-0928-02",
        source: "Ranger upload",
        uploaded: "28 Sep 2026 11:15",
        total: 85,
        processed: 72,
        status: "Processing (13)",
      },
      {
        id: "B-2026-0928-03",
        source: "Camera images",
        uploaded: "28 Sep 2026 14:20",
        total: 200,
        processed: 200,
        status: "Saved",
      },
      {
        id: "B-2026-0928-04",
        source: "CSV (external)",
        uploaded: "28 Sep 2026 16:44",
        total: 450,
        processed: 450,
        status: "Saved",
      },
    ],
    preferences: {
      "admin-System alerts": true,
      "admin-Wildlife alerts": true,
      "admin-Daily summaries": true,
      "admin-Product updates": false,
      "ranger-Wildlife alerts (assigned zones)": true,
      "ranger-Daily activity summary": true,
      "ranger-System announcements": true,
      "ranger-Camera status alerts": true,
    },
    profiles: defaultProfiles(),
    config: { threshold: 0.8, advisory: 70, interval: 6 },
  };
}
export function shortDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function csvDownload(name: string, rows: (string | number)[][]) {
  const safe = (value: string | number) => {
    let v = String(value);
    if (/^[=+@\-]/.test(v)) v = "'" + v;
    return '"' + v.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
