"use client";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Info } from "lucide-react";
import { shortDate, ZONES } from "@/lib/data";
import { DEMO_ZONE_RISK, DEMO_ZONE_TREND } from "@/lib/maps";
import { useApp, useAssignedZones } from "@/components/context";
import { Badge, Card, Heading, MapPanel, WildlifeImage } from "@/components/ui";
import { useVisibleSightings } from "@/components/filters";

export default function Predictions() {
  const { role, go, setSelectedId } = useApp();
  const sightings = useVisibleSightings();
  const [zone, setZone] = useState("");
  const zones = useAssignedZones();
  const rows = zones
    .map((z) => {
      const risk = DEMO_ZONE_RISK[z];
      return {
        zone: z,
        risk,
        trend: DEMO_ZONE_TREND[z],
        tone: risk >= 70 ? "red" : risk >= 40 ? "yellow" : "blue",
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
