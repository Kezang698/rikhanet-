"use client";
import { useState } from "react";
import { useApp } from "./context";

export function BackendStatus() {
  const { backend, refreshBackend, loadOlderSightings, data, notify } = useApp();
  const [loading, setLoading] = useState(false);
  if (backend.mode === "demo") return null;
  return <aside className={`backend-status ${backend.status}`} aria-live="polite">
    <div>
      <strong>{backend.status === "connected" ? "PostgreSQL connected" : backend.status === "loading" ? "Connecting to backend…" : "Backend connection unavailable"}</strong>
      <p>{backend.status === "error" ? backend.error : backend.status === "connected"
        ? `${data.sightings.length} stored sightings loaded${backend.totalSightings > data.sightings.length ? ` of ${backend.totalSightings}` : ""}.`
        : "Stored sightings and forecasts will appear when the API is ready."}</p>
      {backend.status === "error" && backend.lastSynced && <p>Showing records from the last successful refresh.</p>}
      {backend.health?.prediction.status === "unavailable" && <p>{backend.health.prediction.reason}</p>}
      {backend.health?.prediction.status === "prototype" && <p>TFT prototype enabled · Matching binary reference validation is pending.</p>}
      <small>Accounts, assignments, reports, reviews and alert responses are stored in PostgreSQL. Camera setup remains local.</small>
    </div>
    <div className="button-row">
      {backend.totalSightings > data.sightings.length && <button disabled={loading} onClick={async () => {
        setLoading(true);
        try { await loadOlderSightings(); } catch (error) { notify(error instanceof Error ? error.message : "Could not load older sightings"); }
        finally { setLoading(false); }
      }}>{loading ? "Loading…" : "Load older sightings"}</button>}
      <button onClick={() => void refreshBackend()}>Refresh</button>
    </div>
  </aside>;
}
