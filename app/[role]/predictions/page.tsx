"use client";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Info } from "lucide-react";
import { shortDate, ZONES, type Zone } from "@/lib/data";
import { useApp } from "@/components/context";
import { Badge, Card, Heading, MapPanel, WildlifeImage } from "@/components/ui";
import { useVisibleSightings } from "@/components/filters";

export default function Predictions() {
  const { role, go, setSelectedId } = useApp();
  const sightings = useVisibleSightings();
  const [zone, setZone] = useState("");
  const rows = [
    { zone: "GE-3", risk: 72, trend: "Increasing", tone: "red" },
    { zone: "GE-2", risk: 58, trend: "Increasing", tone: "yellow" },
    { zone: "GE-1", risk: 28, trend: "Stable", tone: "blue" },
    { zone: "GE-4", risk: 16, trend: "Decreasing", tone: "blue" },
  ].filter((r) => role === "admin" || ["GE-1", "GE-2"].includes(r.zone));
  return (
    <>
      <Heading
        title="Predictions"
        description={`Modelled Asian elephant occurrence risk ${role === "ranger" ? "in your assigned zones" : "by zone"} (next 24 hours)`}
      >
        <span className="forecast-generated">
          {role === "ranger" ? "Generated: 08:00" : "Generated: 28 Sep 2026, 08:00"} <Info size={18} />
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
              {sightings.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    go("sightings");
                  }}
                >
                  <WildlifeImage sighting={s} />
                  <b>{s.zone}</b>
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
          <Card title="Zonal Risk Forecast">
            <table className="forecast-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Risk (next 24h)</th>
                  <th>Trend</th>
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
                      {r.zone} — {ZONES[r.zone as Zone]}
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
                        {r.trend === "Increasing" ? (
                          <ArrowUp size={19} />
                        ) : r.trend === "Decreasing" ? (
                          <ArrowDown size={19} />
                        ) : (
                          <ArrowRight size={19} />
                        )}{" "}
                        {r.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card
            title="Model Information"
            action={<Badge tone="purple">Research Preview</Badge>}
          >
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
          </Card>
        </div>
      </div>
    </>
  );
}
