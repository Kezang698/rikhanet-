"use client";
import { Suspense, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Info } from "lucide-react";
import { shortDate, ZONES } from "@/lib/data";
import { DEMO_ZONE_RISK, DEMO_ZONE_TREND } from "@/lib/maps";
import { latestForecasts } from "@/lib/api";
import { useApp, useAssignedZones } from "@/components/context";
import { Badge, Card, Heading, MapPanel, WildlifeImage } from "@/components/ui";
import { useVisibleSightings } from "@/components/filters";
import { TriggerPredictions } from "@/components/TriggerPredictions";

export default function PredictionsPage() {
  const { backend } = useApp();
  return backend.mode === "api" ? <Suspense fallback={<p>Loading predictions…</p>}><TriggerPredictions /></Suspense> : <DemoPredictions />;
}

function DemoPredictions() {
  const { role, go, setSelectedId, backend } = useApp();
  const database = backend.mode === "api";
  const forecasts = latestForecasts(backend.predictions);
  const sightings = useVisibleSightings();
  const [zone, setZone] = useState("");
  const zones = useAssignedZones();
  const generatedAt = zones.flatMap((z) => forecasts[z] ? [forecasts[z].predicted_at] : []).sort().at(-1);
  const rows = zones
    .filter((z) => !database || forecasts[z])
    .map((z) => {
      const forecast = forecasts[z];
      const risk = database ? Math.round(forecast.p_present * 1000) / 10 : DEMO_ZONE_RISK[z];
      return {
        zone: z,
        risk,
        trend: database ? "—" : DEMO_ZONE_TREND[z],
        tone: database ? forecast.risk_label === "HIGH" ? "red" : forecast.risk_label === "MEDIUM" ? "yellow" : "blue"
          : risk >= 70 ? "red" : risk >= 40 ? "yellow" : "blue",
      };
    })
    .sort((a, b) => b.risk - a.risk);
  return (
    <>
      <Heading
        title="Predictions"
        description={`Modelled Asian elephant occurrence risk ${role === "ranger" ? "in your assigned gewogs" : "by gewog"} (next 24 hours)`}
      >
        <span className="forecast-generated">
          {database ? generatedAt ? `Generated: ${new Date(generatedAt).toLocaleString("en-GB", { timeZone: "Asia/Thimphu" })}` : "No current forecast" : role === "ranger" ? "Generated: 08:00" : "Generated: 28 Sep 2026, 08:00"} <Info size={18} />
        </span>
      </Heading>
      <div className="predictions-grid">
        <div>
          <MapPanel mode="prediction" activeZone={zone} onSelect={setZone} />
          <Card
            title="Recent Evidence (last 48 hours)"
            className="evidence-card"
          >
            <div className="evidence-grid">
              {sightings.filter((s) => !database || Date.now() - Date.parse(`${s.date}T${s.time}:00+06:00`) < 48 * 3600_000).slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    go("sightings");
                  }}
                >
                  <WildlifeImage sighting={s} />
                  <b>{ZONES[s.zone]}</b>
                  <small>
                    {shortDate(s.date)}, {s.time}
                  </small>
                  <small>{s.species}</small>
                </button>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card title="Gewog Risk Forecast">
            <table className="forecast-table">
              <thead>
                <tr>
                  <th>Gewog</th>
                  <th>Risk (next 24h)</th>
                  <th>{database ? "Risk label" : "Trend"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.zone}
                    onClick={() => setZone(r.zone)}
                    className={zone === r.zone ? "row-selected" : ""}
                  >
                    <td>
                      {ZONES[r.zone]}
                    </td>
                    <td>
                      <Badge tone={r.tone}>{r.risk}%</Badge>
                    </td>
                    <td>
                      <span
                        className={
                          r.trend === "Increasing" ? "trend red" : "trend blue"
                        }
                      >
                        {database ? forecasts[r.zone].risk_label : r.trend === "Increasing" ? (
                          <ArrowUp size={19} />
                        ) : r.trend === "Decreasing" ? (
                          <ArrowDown size={19} />
                        ) : (
                          <ArrowRight size={19} />
                        )}{" "}
                        {!database && r.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="muted">No stored predictions within the current 24-hour horizon. Gewogs without a forecast appear grey on the map.</p>}
          </Card>
          <Card
            title="Model Information"
            action={<Badge tone="purple">{database ? "Prototype pipeline" : "Research Preview"}</Badge>}
          >
            {database ? <>
              <p>Each trigger produces a probability of elephant presence over the next 24 hours for each neighbouring gewog. The table shows the latest stored result for each neighbour.</p>
              <p>{backend.health?.prediction.reason ?? "Connect the backend to see prediction readiness."}</p>
              <p className="muted small">The prototype uses non-Bhutanese training data and may use synthetic camera coordinates. Forecasts remain illustrative.</p>
            </> : <>
            <p>
              This model estimates the probability of Asian elephant presence in
              each zone over the next 24 hours using recent sightings, habitat
              features, seasonal patterns and camera activity. It does not
              predict exact individual movement paths.
            </p>
            <dl className="details roomy">
              <dt>Forecast timestamp</dt>
              <dd>28 Sep 2026, 08:00</dd>
              <dt>Model version</dt>
              <dd>v0.1 (research preview)</dd>
              <dt>Typical uncertainty</dt>
              <dd>
                ± 20–30% (zone level) <Info size={14} />
              </dd>
            </dl>
            <p className="muted small">
              These are the document’s illustrative forecast values. No
              prediction model runs in this frontend.
            </p>
            </>}
          </Card>
        </div>
      </div>
    </>
  );
}
