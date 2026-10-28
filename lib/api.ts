import type { Sighting } from "./data";

export const DATABASE_MODE = process.env.NEXT_PUBLIC_DATA_MODE !== "demo";
// Pad fractional seconds to preserve PostgreSQL's microsecond ordering.
export function utcOrderKey(row: { timestamp: string; detection_id: string }) {
  const fraction = row.timestamp.match(/\.(\d+)/)?.[1] ?? "";
  return new Date(row.timestamp).toISOString().slice(0, 19) + "." + fraction.padEnd(6, "0") + row.detection_id;
}
export interface StoredSighting {
  review_status?: Sighting["review"];
  review_note?: string;
  flagged?: boolean;
  detection_id: string;
  camera_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  gewog_code: number;
  gewog_name: string;
  species: string | null;
  confidence: number | null;
  sight_elev: number | null;
  cur_temp: number | null;
  cur_hum: number | null;
  cur_precip: number | null;
  discarded: boolean;
  image_path: string | null;
}
export interface Forecast {
  prediction_id: number;
  cur_code: number;
  nbr_code: number;
  nbr_name: string;
  p_low: number;
  p_present: number;
  risk_label: "LOW" | "MEDIUM" | "HIGH";
  predicted_at: string;
}
export interface PredictionGroup {
  detection_id: string;
  timestamp: string;
  gewog_name: string;
  camera_id: string;
  species: string;
  confidence: number;
  predictions: Forecast[];
}
export interface BackendHealth {
  status: string;
  database: string;
  gewog_count: number;
  prediction: { status: string; missing_artifacts: string[]; reason: string };
}
export interface BackendState {
  mode: "api" | "demo";
  status: "loading" | "connected" | "error";
  error: string;
  health: BackendHealth | null;
  predictions: PredictionGroup[];
  totalSightings: number;
  lastSynced: string | null;
}
export interface ObservationInput {
  camera_id: string;
  species: string;
  confidence: number;
  latitude?: number;
  longitude?: number;
  expected_gewog_code?: number;
}
export interface AuthUser {
  id: string; name: string; email: string; role: "admin" | "ranger"; active: boolean;
  phone: string; notes: string; preferences: Record<string, boolean>; zones: string[];
  mfa_enabled: boolean; created_at: string; last_login: string | null;
}
export interface EnrichmentResult {
  prediction_status?: string;
  prediction_error?: string;
  skipped?: string;
  predictions?: Forecast[];
}

export interface TriggerPrediction {
  trigger: StoredSighting;
  predictions: Forecast[];
  prediction_status: "complete" | "pending" | "incomplete" | "unavailable" | "unvalidated" | "discarded";
  expected_neighbours: number[];
  valid_until: string;
  expired: boolean;
  reason: string;
  model_status: BackendHealth["prediction"];
  history_counts: Record<string, number>;
  min_history_events: number | null;
}

export function forecastColor(label?: Forecast["risk_label"]) {
  return label === "HIGH" ? "#dc2626" : label === "MEDIUM" ? "#eab308" : label === "LOW" ? "#2563eb" : "#88928c";
}

export function forecastsForTrigger(predictions: Forecast[]): Record<string, Forecast> {
  return Object.fromEntries(predictions.map((forecast) => [String(forecast.nbr_code), forecast]));
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf = typeof document === "undefined" ? "" : document.cookie.split("; ").find(c => c.startsWith("rikhanet_csrf="))?.split("=")[1] ?? "";
  const response = await fetch(`/api/backend/${path}`, { ...init, cache: "no-store",
    credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Rikhanet-Request": "1", "X-CSRF-Token": csrf, ...init.headers }, signal: init.signal ?? AbortSignal.timeout(65_000) });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("auth/") && typeof window !== "undefined") window.dispatchEvent(new Event("rikhanet-session-expired"));
    const message = typeof body.detail === "string" ? body.detail :
      Array.isArray(body.detail) ? body.detail.map((e: { msg: string }) => e.msg).join("; ") : "API request failed";
    throw new Error(message);
  }
  return body as T;
}

export function bhutanDateParts(timestamp: string) {
  const date = new Date(timestamp);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Thimphu", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function toSighting(row: StoredSighting): Sighting {
  const names: Record<string, string> = { elephant: "Asian Elephant", "asian elephant": "Asian Elephant" };
  const synthetic = row.camera_id.startsWith("SYNTH-");
  return { id: row.detection_id, camera: row.camera_id, ...bhutanDateParts(row.timestamp),
    zone: String(row.gewog_code), species: row.species ? names[row.species.toLowerCase()] ?? row.species : "Pending detection",
    confidence: row.confidence ?? 0, review: row.review_status ?? "Automatically saved", flagged: row.flagged ?? false,
    source: synthetic ? "Synthetic observation" : "Stored observation",
    lat: row.latitude, lng: row.longitude, persisted: true, detectionPending: row.species === null || row.confidence === null,
    timestamp: row.timestamp, imageUrl: row.image_path ? `/api/backend/sightings/${row.detection_id}/image` : undefined,
    enriched: [row.sight_elev, row.cur_temp, row.cur_hum, row.cur_precip].every((value) => value !== null),
    note: row.review_note || (synthetic ? "Synthetic sample: GPS, detection confidence, elevation and weather are generated for demonstration. No camera image was captured."
      : "Stored in PostgreSQL. Laptop-camera coordinates may be synthetic inside GMC.") };
}

export async function attachSightingImage(id: string, image: Blob) {
  return apiRequest<{ image_url: string }>(`sightings/${id}/image`, { method: "PUT", body: image,
    headers: { "Content-Type": image.type } });
}

export interface CsvImportResult {
  validated: number;
  imported: number;
  new_rows: number;
  skipped: number;
  dry_run: boolean;
  preview: Pick<StoredSighting, "detection_id" | "timestamp" | "gewog_name" | "camera_id" | "species" | "confidence">[];
}

/** Latest stored prediction per neighbour, valid only inside its 24-hour horizon. */
export function latestForecasts(groups: PredictionGroup[], now = Date.now()): Record<string, Forecast> {
  const latest: Record<string, Forecast> = {};
  for (const group of groups) {
    const triggerTime = Date.parse(group.timestamp);
    if (now - triggerTime >= 24 * 3600_000 || triggerTime > now) continue;
    for (const forecast of group.predictions) {
      const key = String(forecast.nbr_code);
      if (!latest[key] || Date.parse(forecast.predicted_at) > Date.parse(latest[key].predicted_at)) latest[key] = forecast;
    }
  }
  return latest;
}
