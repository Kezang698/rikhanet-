import type { CameraRecord, Sighting, Zone } from "./data";

export type Coordinates = [number, number];
export interface MapLocation {
  coordinates: Coordinates;
  source: "demo" | "camera" | "recorded";
}

// Gelephu town centre; the basemap supplies real roads and geography.
export const GELEPHU_CENTER: Coordinates = [26.87056, 90.48556];
export const GELEPHU_ZOOM = 12;
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

// Illustrative monitoring sectors, not surveyed or administrative boundaries.
export const DEMO_ZONE_CENTERS: Record<Zone, Coordinates> = {
  "GE-1": [26.879, 90.477],
  "GE-2": [26.8815, 90.516],
  "GE-3": [26.8585, 90.502],
  "GE-4": [26.915, 90.495],
};
export const DEMO_ZONE_RISK: Record<Zone, number> = {
  "GE-1": 28, "GE-2": 58, "GE-3": 72, "GE-4": 16,
};

export function demoCoordinates(zone: Zone, id: string): Coordinates {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const center = DEMO_ZONE_CENTERS[zone];
  const angle = (hash % 360) * Math.PI / 180;
  const radius = 0.002 + ((hash >>> 8) % 70) / 10000;
  return [
    Number((center[0] + Math.sin(angle) * radius).toFixed(6)),
    Number((center[1] + Math.cos(angle) * radius).toFixed(6)),
  ];
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
