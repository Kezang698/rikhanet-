import type { CameraRecord, Sighting, Zone } from "./data";
import { GEWOGS, type Gewog } from "./gewogs";

export type Coordinates = [number, number];
export interface MapLocation {
  coordinates: Coordinates;
  source: "demo" | "camera" | "recorded";
}

// Bounds of the 17 gewogs of the Gelephu Mindfulness City area.
export function boundsOf(zones?: readonly string[]): [Coordinates, Coordinates] {
  const chosen = GEWOGS.filter(g => !zones || zones.includes(g.id));
  const rings = (chosen.length ? chosen : GEWOGS).flatMap(g => g.ring);
  const lats = rings.map(p => p[0]), lngs = rings.map(p => p[1]);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}
export const GMC_BOUNDS = boundsOf();
export const GELEPHU_CENTER: Coordinates = [
  (GMC_BOUNDS[0][0] + GMC_BOUNDS[1][0]) / 2,
  (GMC_BOUNDS[0][1] + GMC_BOUNDS[1][1]) / 2,
];
export const GELEPHU_ZOOM = 9;
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const GEWOG_BY_ID: Record<string, Gewog> = Object.fromEntries(GEWOGS.map(g => [g.id, g]));

function hashOf(text: string) {
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

// Demonstration risk values (not model output), one per gewog and stable between loads.
export const DEMO_ZONE_RISK: Record<Zone, number> = Object.fromEntries(
  GEWOGS.map(g => [g.id, 8 + (hashOf("risk" + g.id) % 80)]),
);
export const DEMO_ZONE_TREND: Record<Zone, "Increasing" | "Stable" | "Decreasing"> = Object.fromEntries(
  GEWOGS.map(g => [g.id, (["Increasing", "Stable", "Decreasing"] as const)[hashOf("trend" + g.id) % 3]]),
);

function insideRing([lat, lng]: Coordinates, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lati, lngi] = ring[i], [latj, lngj] = ring[j];
    if ((lati > lat) !== (latj > lat) && lng < (lngj - lngi) * (lat - lati) / (latj - lati) + lngi) inside = !inside;
  }
  return inside;
}

/** A repeatable sample position that is always inside the gewog polygon. */
export function demoCoordinates(zone: Zone, id: string): Coordinates {
  const gewog = GEWOG_BY_ID[zone] ?? GEWOGS[0];
  const [min, max] = boundsOf([gewog.id]);
  let seed = hashOf(id);
  for (let attempt = 0; attempt < 60; attempt++) {
    seed = hashOf(String(seed) + attempt);
    const lat = min[0] + (max[0] - min[0]) * ((seed & 0xffff) / 0xffff);
    const lng = min[1] + (max[1] - min[1]) * (((seed >>> 16) & 0xffff) / 0xffff);
    if (insideRing([lat, lng], gewog.ring)) return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
  }
  return gewog.label;
}

export function validCoordinates(lat: unknown, lng: unknown): Coordinates | null {
  if (lat === "" || lng === "" || lat == null || lng == null) return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [latitude, longitude] : null;
}

export function cameraLocation(camera: CameraRecord): MapLocation {
  const coordinates = validCoordinates(camera.lat, camera.lng);
  // Older demo archives reused one invented coordinate for every camera.
  const legacyDemo = !camera.locationSource &&
    Number(camera.lat) === 27.0285 && Number(camera.lng) === 90.4791 &&
    camera.source === "Recorded (demo)";
  if (!coordinates || legacyDemo) {
    return { coordinates: demoCoordinates(camera.zone, camera.id), source: "demo" };
  }
  return { coordinates, source: camera.locationSource === "demo" ? "demo" : "recorded" };
}

export function sightingLocation(sighting: Sighting, cameras: CameraRecord[]): MapLocation {
  const recorded = validCoordinates(sighting.lat, sighting.lng);
  if (recorded) return { coordinates: recorded, source: "recorded" };
  const camera = cameras.find((record) => record.id === sighting.camera);
  if (camera) {
    const location = cameraLocation(camera);
    return { ...location, source: location.source === "demo" ? "demo" : "camera" };
  }
  return { coordinates: demoCoordinates(sighting.zone, sighting.id), source: "demo" };
}

export function formatCoordinates([lat, lng]: Coordinates) {
  return `${Math.abs(lat).toFixed(5)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(5)}° ${lng < 0 ? "W" : "E"}`;
}

export function locationLabel(source: MapLocation["source"]) {
  return source === "demo" ? "Sample position — GPS not supplied"
    : source === "camera" ? "Camera location" : "Entered coordinates";
}
