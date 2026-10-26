"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, LocateFixed, MapPin, Maximize, Minus, Plus, RefreshCw, X } from "lucide-react";
import type * as Leaflet from "leaflet";
import { TODAY, ZONES, type CameraRecord, type Sighting, type Zone } from "@/lib/data";
import {
  cameraLocation, DEMO_ZONE_CENTERS, DEMO_ZONE_RISK, formatCoordinates,
  GELEPHU_CENTER, GELEPHU_ZOOM, locationLabel, MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL, sightingLocation, type Coordinates,
} from "@/lib/maps";
import { useApp } from "./context";

interface MapPanelProps {
  mode?: "activity" | "wildlife" | "prediction" | "zones" | "cameras";
  onSelect?: (zone: Zone) => void;
  activeZone?: string;
  filterLabel?: string;
  sightings?: Sighting[];
  cameras?: CameraRecord[];
  selectedSightingId?: string;
  selectedCameraId?: string;
  onSightingSelect?: (id: string) => void;
  onCameraSelect?: (id: string) => void;
}

function popupText(parent: HTMLElement, tag: "strong" | "p" | "small", text: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

const CAMERA_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4h6l2 3h4v13H3V7h4z"/><circle cx="12" cy="13" r="4"/></svg>';
const SIGHTING_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><ellipse cx="12" cy="16" rx="6" ry="5"/><ellipse cx="5" cy="9" rx="2.5" ry="3.5"/><ellipse cx="10" cy="5" rx="2.5" ry="3.5"/><ellipse cx="16" cy="6" rx="2.5" ry="3.5"/><ellipse cx="20" cy="11" rx="2.5" ry="3.5"/></svg>';

export function MapPanel({
  mode = "activity", activeZone, filterLabel, sightings, cameras,
  selectedSightingId, selectedCameraId, onSelect, onSightingSelect, onCameraSelect,
}: MapPanelProps) {
  const { role, data } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const markers = useRef<Array<{ marker: Leaflet.Marker; ids: string[] }>>([]);
  const sectors = useRef<Array<{ circle: Leaflet.Circle; zone: Zone }>>([]);
  const actions = useRef({ onSelect, onSightingSelect, onCameraSelect });
  actions.current = { onSelect, onSightingSelect, onCameraSelect };
  const [leaflet, setLeaflet] = useState<typeof Leaflet | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [showSightings, setShowSightings] = useState(mode !== "zones" && mode !== "prediction" && mode !== "cameras");
  const [showCameras, setShowCameras] = useState(mode !== "zones" && mode !== "prediction");
  const [showZones, setShowZones] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(GELEPHU_ZOOM);
  const allowedZones = useMemo(() => (Object.keys(ZONES) as Zone[]).filter(
    zone => role === "admin" || zone === "GE-1" || zone === "GE-2",
  ), [role]);
  const visibleSightings = useMemo(() =>
    (sightings ?? data.sightings.filter(s => s.date === TODAY))
      .filter(s => allowedZones.includes(s.zone)),
  [sightings, data.sightings, allowedZones]);
  const visibleCameras = useMemo(() =>
    (cameras ?? data.cameras).filter(c => allowedZones.includes(c.zone)),
  [cameras, data.cameras, allowedZones]);
  // Selection changes do not recreate markers or close an open popup.
  const layerKey = JSON.stringify({ visibleSightings, visibleCameras, allCameras: data.cameras, allowedZones, mode, showSightings, showCameras, showZones });

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let instance: Leaflet.Map | undefined;
    let frame = 0;
    async function start() {
      try {
        const module = await import("leaflet");
        const L = module.default ?? module;
        if (disposed || !container.current) return;
        instance = L.map(container.current, {
          center: GELEPHU_CENTER, zoom: GELEPHU_ZOOM,
          minZoom: 3, maxZoom: 19, zoomControl: false,
          scrollWheelZoom: false, touchZoom: true, keyboard: true,
          zoomAnimation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        map.current = instance;
        instance.attributionControl.setPrefix(false);
        L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 90 }).addTo(instance);
        let failed = false;
        const layer = L.tileLayer(MAP_TILE_URL, {
          attribution: MAP_TILE_ATTRIBUTION, maxZoom: 19,
          updateWhenIdle: true, keepBuffer: 1,
        });
        layer.on("loading", () => { failed = false; setLoading(true); });
        layer.on("tileerror", () => { failed = true; });
        layer.on("load", () => {
          if (disposed) return;
          setLoading(false);
          setError(failed ? "Some map tiles could not load. Check your internet connection and retry." : "");
        });
        layer.addTo(instance);
        tiles.current = layer;
        instance.on("zoomend", () => setZoom(instance!.getZoom()));
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            if (!disposed) instance?.invalidateSize({ pan: false, debounceMoveend: true });
          });
        });
        observer.observe(container.current);
        setLeaflet(L);
      } catch {
        if (!disposed) {
          setLoading(false);
          setError("The map could not start. Reload the page to try again.");
        }
      }
    }
    void start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      instance?.remove();
      map.current = null;
      tiles.current = null;
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !map.current) return;
    const L = leaflet;
    const group = L.layerGroup().addTo(map.current);
    markers.current = [];
    sectors.current = [];
    function popupAction(parent: HTMLElement, label: string, action: () => void) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      parent.append(button);
    }
    if (showZones) {
      for (const zone of allowedZones) {
        const risk = DEMO_ZONE_RISK[zone];
        const color = mode === "prediction" ? risk >= 70 ? "#dc2626" : risk >= 40 ? "#eab308" : "#2563eb" : "#0b6b50";
        const circle = L.circle(DEMO_ZONE_CENTERS[zone], {
          radius: 1050, color, weight: 2, dashArray: "6 6", fillOpacity: 0.1,
          interactive: false,
        }).addTo(group);
        sectors.current.push({ circle, zone });
        const marker = L.marker(DEMO_ZONE_CENTERS[zone], {
          icon: L.divIcon({ className: "map-sector-label", html: `<span>${zone}${mode === "prediction" ? ` · ${risk}%` : ""}</span>`, iconSize: [90, 30], iconAnchor: [45, 15] }),
          title: `Inspect ${zone} ${ZONES[zone]} — illustrative sector`,
          keyboard: true, zIndexOffset: 100,
        }).addTo(group);
        const popup = document.createElement("div");
        popup.className = "map-record-popup";
        popupText(popup, "strong", `${zone} — ${ZONES[zone]}`);
        popupText(popup, "small", "Illustrative monitoring sector. This is not an official boundary.");
        if (mode === "prediction") popupText(popup, "p", `${risk}% modelled risk (demonstration)`);
        if (actions.current.onSelect) popupAction(popup, "View zone", () => actions.current.onSelect?.(zone));
        marker.bindPopup(popup, { maxWidth: 260 });
      }
    }
    if (showCameras) {
      for (const camera of visibleCameras) {
        const location = cameraLocation(camera);
        const marker = L.marker(location.coordinates, {
          icon: L.divIcon({ className: `map-record-marker camera-marker ${camera.status === "Online" ? "online" : "offline"}`, html: CAMERA_ICON, iconSize: [30, 30], iconAnchor: [3, 17] }),
          title: `${camera.id} — ${camera.status}`, keyboard: true, zIndexOffset: 200,
        }).addTo(group);
        const popup = document.createElement("div");
        popup.className = "map-record-popup";
        popupText(popup, "strong", camera.id);
        popupText(popup, "p", `${camera.zone} · ${camera.status}`);
        popupText(popup, "small", `${formatCoordinates(location.coordinates)} · ${locationLabel(location.source)}`);
        if (actions.current.onCameraSelect) popupAction(popup, "View camera", () => actions.current.onCameraSelect?.(camera.id));
        marker.bindPopup(popup, { maxWidth: 260 });
        markers.current.push({ marker, ids: [camera.id] });
      }
    }
    if (showSightings) {
      const grouped = new Map<string, { point: Coordinates; records: Sighting[] }>();
      for (const sighting of visibleSightings) {
        const point = sightingLocation(sighting, data.cameras).coordinates;
        const key = point.join(",");
        const existing = grouped.get(key);
        if (existing) existing.records.push(sighting);
        else grouped.set(key, { point, records: [sighting] });
      }
      for (const { point, records } of grouped.values()) {
        const marker = L.marker(point, {
          icon: L.divIcon({ className: "map-record-marker sighting-marker", html: records.length > 1 ? `<b>${records.length}</b>` : SIGHTING_ICON, iconSize: [30, 30], iconAnchor: [25, 36] }),
          title: `${records.length} sighting${records.length === 1 ? "" : "s"}: ${records.map(s => s.species).join(", ")}`,
          keyboard: true, zIndexOffset: 500,
        }).addTo(group);
        const popup = document.createElement("div");
        popup.className = "map-record-popup";
        popupText(popup, "strong", records.length > 1 ? `${records.length} sightings at this location` : records[0].species);
        popupText(popup, "small", `${formatCoordinates(point)} · ${locationLabel(sightingLocation(records[0], data.cameras).source)}`);
        const list = document.createElement("div");
        list.className = "map-popup-records";
        for (const sighting of records) {
          const label = `${sighting.species} · ${sighting.time} · ${sighting.camera}`;
          if (actions.current.onSightingSelect) popupAction(list, label, () => actions.current.onSightingSelect?.(sighting.id));
          else popupText(list, "p", label);
        }
        popup.append(list);
        marker.bindPopup(popup, { maxWidth: 280 });
        markers.current.push({ marker, ids: records.map(record => record.id) });
      }
    }
    return () => { group.remove(); };
  // layerKey includes record content; callbacks and selection use refs/effects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaflet, layerKey]);

  useEffect(() => {
    for (const { marker, ids } of markers.current) {
      marker.getElement()?.classList.toggle("selected", ids.includes(selectedSightingId ?? "") || ids.includes(selectedCameraId ?? ""));
    }
    for (const { circle, zone } of sectors.current) {
      circle.setStyle({ weight: activeZone === zone ? 3 : 2, fillOpacity: activeZone === zone ? 0.22 : 0.1 });
    }
  }, [leaflet, layerKey, selectedSightingId, selectedCameraId, activeZone]);

  useEffect(() => {
    const selected = markers.current.find(({ ids }) =>
      ids.includes(selectedSightingId ?? "") || ids.includes(selectedCameraId ?? ""),
    );
    if (selected) map.current?.panInside(selected.marker.getLatLng(), { padding: [55, 55], animate: false });
  }, [leaflet, selectedSightingId, selectedCameraId]);

  function fitResults() {
    if (!map.current || !leaflet) return;
    const points: Coordinates[] = [
      ...(showSightings ? visibleSightings.map(s => sightingLocation(s, data.cameras).coordinates) : []),
      ...(showCameras ? visibleCameras.map(c => cameraLocation(c).coordinates) : []),
      ...(showZones ? allowedZones.map(zone => DEMO_ZONE_CENTERS[zone]) : []),
    ];
    if (points.length) map.current.fitBounds(leaflet.latLngBounds(points), { padding: [48, 48], maxZoom: 15, animate: false });
    else map.current.setView(GELEPHU_CENTER, GELEPHU_ZOOM);
  }

  return (
    <section className={`map-panel real-map map-${mode}`} aria-label="Interactive map of Gelephu">
      <div className="map-location-bar">
        <span><MapPin size={16} /> <b>Gelephu, Bhutan</b></span>
        <small>Real map · Demo overlays</small>
      </div>
      <div className="map-canvas-wrap">
        <div ref={container} className="map-canvas" aria-label="Gelephu map. Use arrow keys to pan and plus or minus to zoom." />
        <div className="real-map-controls" aria-label="Map controls">
          <button type="button" aria-label="Zoom in" disabled={!leaflet || zoom >= 19} onClick={() => map.current?.zoomIn()}><Plus size={20} /></button>
          <button type="button" aria-label="Zoom out" disabled={!leaflet || zoom <= 3} onClick={() => map.current?.zoomOut()}><Minus size={20} /></button>
          <button type="button" aria-label="Reset map to Gelephu" title="Reset map to Gelephu" disabled={!leaflet} onClick={() => map.current?.setView(GELEPHU_CENTER, GELEPHU_ZOOM, { animate: false })}><LocateFixed size={19} /></button>
          <button type="button" aria-label="Fit visible map results" title="Fit visible results" disabled={!leaflet} onClick={fitResults}><Maximize size={18} /></button>
          <button type="button" aria-label="Map layers" aria-expanded={layersOpen} onClick={() => setLayersOpen(value => !value)}><Layers size={19} /></button>
        </div>
        {layersOpen && (
          <div className="real-map-layers" aria-label="Map layers panel">
            <div><strong>Map layers</strong><button type="button" className="icon-button" aria-label="Close map layers" onClick={() => setLayersOpen(false)}><X size={18} /></button></div>
            <label><input type="checkbox" checked={showSightings} onChange={event => setShowSightings(event.target.checked)} /> Sightings</label>
            <label><input type="checkbox" checked={showCameras} onChange={event => setShowCameras(event.target.checked)} /> Cameras</label>
            <label><input type="checkbox" checked={showZones} onChange={event => setShowZones(event.target.checked)} /> Illustrative GE sectors</label>
            <small>Sector circles and sample positions are not surveyed boundaries or live detections.</small>
          </div>
        )}
        {(loading || error) && (
          <div className={`map-load-status ${error ? "map-load-error" : ""}`} role="status">
            <span>{error || "Loading Gelephu map…"}</span>
            {error && tiles.current && <button type="button" onClick={() => { setError(""); setLoading(true); tiles.current?.redraw(); }}><RefreshCw size={15} /> Retry</button>}
          </div>
        )}
      </div>
      <div className="real-map-footer">
        <div className="real-map-legend">
          {showSightings && <span><i className="legend-sighting" /> Sightings ({visibleSightings.length})</span>}
          {showCameras && <><span><i className="legend-online" /> Camera online</span><span><i className="legend-offline" /> Camera offline</span></>}
          {showZones && <span><i className="legend-sector" /> Demo sector</span>}
        </div>
        {filterLabel && <span className="map-results-label">{filterLabel}</span>}
        <span className="map-gesture-hint">Drag to pan · Pinch or use +/− to zoom</span>
      </div>
    </section>
  );
}
