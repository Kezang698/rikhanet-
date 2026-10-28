"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ArrowLeft, Image as ImageIcon, TriangleAlert, Diamond, CircleCheck } from "lucide-react";
import { apiRequest, latestForecasts, forecastsForTrigger, toSighting,
  type TriggerPrediction, type EnrichmentResult } from "@/lib/api";
import { ZONES } from "@/lib/data";
import { useApp, useAssignedZones } from "./context";
import { Badge, Card, Heading, MapPanel, WildlifeImage } from "./ui";
import { useVisibleSightings } from "./filters";

const dateLabel = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Thimphu" });

export function TriggerPredictions() {
  const { role, backend, refreshBackend } = useApp();
  const query = useSearchParams();
  const id = query.get("detection");
  const zones = useAssignedZones();
  const sightings = useVisibleSightings();
  const [detail, setDetail] = useState<TriggerPrediction | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [zone, setZone] = useState("");
  const validId = !id || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id || !validId) return;
    const result = await apiRequest<TriggerPrediction>(`predictions/${id}`, { signal });
    setDetail(result);
  }, [id, validId]);
  useEffect(() => {
    setDetail(null); setError(""); setZone("");
    if (!id || !validId) return;
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load image predictions");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, load, validId]);

  const focused = detail?.trigger.detection_id === id ? detail : null;
  const allowed = !focused || role === "admin" || zones.includes(String(focused.trigger.gewog_code));
  // An explicit empty map prevents accidental fallback to unrelated global forecasts.
  const forecasts = id ? focused && allowed ? forecastsForTrigger(focused.predictions) : {} : latestForecasts(backend.predictions);
  const rows = Object.values(forecasts).filter((row) => zones.includes(String(row.nbr_code))).sort((a, b) => b.p_present - a.p_present);
  const trigger = focused && allowed ? toSighting(focused.trigger) : null;
  const state = focused?.prediction_status;

  useEffect(() => {
    if (!id || !validId || !allowed || state !== "pending" || running) return;
    const controller = new AbortController();
    const poll = setInterval(() => {
      if (!document.hidden) void load(controller.signal).catch(() => {});
    }, 15_000);
    return () => { clearInterval(poll); controller.abort(); };
  }, [id, validId, allowed, state, running, load]);

  async function run() {
    if (!id) return;
    setRunning(true); setError("");
    try {
      const result = await apiRequest<EnrichmentResult>(`enrich/${id}`, { method: "POST" });
      await load();
      if (result.prediction_error) setError(result.prediction_error);
      await refreshBackend();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Prediction failed"); }
    finally { setRunning(false); }
  }

  return <>
    <Heading title={id ? "Image Prediction" : "Predictions"}
      description={id ? "Neighbour-gewog elephant occurrence forecast for this camera image" : "Latest stored occurrence forecasts for the next 24 hours"}>
      {id && <Link className="text-button" href={`/${role}/predictions`}><ArrowLeft size={16} />All forecasts</Link>}
    </Heading>
    {!validId && <p className="form-error" role="alert">The image prediction link is invalid.</p>}
    {loading && <p role="status">Loading this image and its predictions…</p>}
    {!allowed && <p role="alert">This sighting is outside your assigned gewogs.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {trigger && <Card title="Source image" className="prediction-source-card" action={<Badge tone={state === "complete" ? "green" : "yellow"}>{state === "complete" ? "Prediction complete" : "Prediction pending"}</Badge>}>
      <div className="prediction-source-grid">
        <WildlifeImage sighting={trigger} />
        <div>
          <h3>{trigger.species} · {ZONES[trigger.zone]}</h3>
          <p>{trigger.camera} · {dateLabel(focused!.trigger.timestamp)}</p>
          <p>Detection confidence: {Math.round(trigger.confidence * 100)}%</p>
          <p>{focused!.reason}</p>
          {focused!.model_status.status === "prototype" && <p className="muted small">Prototype TFT output · Binary reference parity is pending.</p>}
          {state === "complete" && <p>Forecast window ends {dateLabel(focused!.valid_until)}.{focused!.expired ? " This saved forecast is expired and shown as historical output." : ""}</p>}
          {state !== "complete" && <button disabled={running || state === "discarded" || state === "incomplete" || trigger.detectionPending} onClick={() => void run()}>
            <RefreshCw size={16} />{running ? "Running prediction…" : "Run / retry prediction"}
          </button>}
          <p className="muted small">The source gewog has a green outline. Only this image’s neighbour forecasts supply the map colours.</p>
        </div>
      </div>
    </Card>}
    <div className="predictions-grid">
      <MapPanel mode="prediction" activeZone={zone} onSelect={setZone} forecasts={forecasts}
        triggerZone={trigger?.zone} triggerSighting={trigger ?? undefined} filterLabel={id ? focused?.expired ? "Historical image forecast" : "This image only" : "Latest valid forecasts"} />
      <Card title={id ? "Predictions for this image" : "Gewog Risk Forecast"}>
        <table className="forecast-table"><thead><tr><th>Neighbour gewog</th><th>Presence probability</th><th>Risk</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.nbr_code} className={zone === String(row.nbr_code) ? "row-selected" : ""} onClick={() => setZone(String(row.nbr_code))}>
            <td>{row.nbr_name}</td><td>{(row.p_present * 100).toFixed(1)}%</td>
            <td><Badge tone={row.risk_label === "HIGH" ? "red" : row.risk_label === "MEDIUM" ? "yellow" : "blue"}>
              {row.risk_label === "HIGH" ? <TriangleAlert size={15} /> : row.risk_label === "MEDIUM" ? <Diamond size={15} /> : <CircleCheck size={15} />}{row.risk_label}
            </Badge></td>
          </tr>)}</tbody></table>
        {!rows.length && <p className="muted">No predictions are stored {id ? "for this image" : "within the current forecast window"}. Grey gewogs have no forecast.</p>}
        {focused && allowed && focused.min_history_events !== null && Object.keys(focused.history_counts).length > 0 && <div>
          <p>Prior elephant events per pair · minimum {focused.min_history_events}</p>
          <ul>{Object.entries(focused.history_counts).filter(([code]) => zones.includes(code)).map(([code, count]) => <li key={code}>
            {ZONES[code] ?? code}: {count} / {focused.min_history_events} required
          </li>)}</ul>
        </div>}
        {!id && <p>{backend.health?.prediction.reason}</p>}
        {focused && allowed && state === "complete" && <p className="muted small">{focused.predictions.length} of {focused.expected_neighbours.length} neighbours predicted. Rangers see assigned gewogs.</p>}
      </Card>
    </div>
    {!id && <Card title="Recent images"><div className="prediction-evidence-grid">
      {sightings.filter((row) => row.persisted && !row.detectionPending).slice(0, 8).map((row) => <Link href={`/${role}/predictions?detection=${row.id}`} key={row.id}>
        <WildlifeImage sighting={row} /><strong>{ZONES[row.zone]}</strong><small>{row.date} {row.time} · {row.camera}</small>
        <span><ImageIcon size={15} />View image prediction</span>
      </Link>)}
      {!sightings.length && <p>No saved images yet. Run elephant detection from Webcam first.</p>}
    </div></Card>}
    <p className="muted small">Prototype forecasts are illustrative: training used non-Bhutanese elephant data, and laptop-camera coordinates may be synthetic.</p>
  </>;
}
