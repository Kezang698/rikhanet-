"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Database, Download } from "lucide-react";
import { csvDownload, shortDate, SPECIES, TODAY, ZONES } from "@/lib/data";
import { useApp, useAssignedZones } from "@/components/context";
import { Animal, Badge, Card, Empty, Heading, Severity } from "@/components/ui";
import {
  SpeciesSelect,
  useVisibleSightings,
  ZoneSelect,
} from "@/components/filters";

const COLOURS = [
  "#095942",
  "#dfad37",
  "#986633",
  "#99ba9b",
  "#4f9bc6",
  "#89948e",
  "#786e94",
];

export default function Reports() {
  const { role, data, notify } = useApp();
  const all = useVisibleSightings();
  const zones = useAssignedZones();
  const [from, setFrom] = useState("2026-09-22"),
    [to, setTo] = useState(TODAY),
    [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [applied, setApplied] = useState({
      from: "2026-09-22",
      to: TODAY,
      species: "all",
      zone: "all",
    });
  const rows = all.filter(
    (s) =>
      s.date >= applied.from &&
      s.date <= applied.to &&
      (applied.species === "all" || s.species === applied.species) &&
      (applied.zone === "all" || s.zone === applied.zone),
  );
  const animals = SPECIES.filter(
    (s) => applied.species === "all" || applied.species === s,
  );
  const trend = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, string | number> = {
      hour: `${String(i * 2).padStart(2, "0")}:00`,
    };
    animals.forEach((sp) => {
      row[sp] = rows.filter(
        (s) =>
          s.species === sp &&
          Math.floor(Number(s.time.split(":")[0]) / 2) === i,
      ).length;
    });
    return row;
  });
  const counts = animals.map((name) => ({
    name,
    count: rows.filter((s) => s.species === name).length,
  }));
  const alerts = data.alerts.filter(
    (a) =>
      zones.includes(a.zone) &&
      a.date >= applied.from &&
      a.date <= applied.to &&
      (applied.zone === "all" || a.zone === applied.zone) &&
      (applied.species === "all" || a.species === applied.species),
  );
  const response = ["Resolved", "Acknowledged", "New"].map((name, i) => ({
    name: name === "New" ? "Pending" : name,
    value: alerts.filter((a) => a.status === name).length,
    colour: ["#1e624b", "#e4ac29", "#dc3445"][i],
  }));
  function exportReport() {
    csvDownload("rikhanet-report.csv", [
      ["Report period", `${applied.from} to ${applied.to}`],
      ["Data source", "Browser demonstration records"],
      ["Species", ...zones.map((z) => ZONES[z]), "Total"],
      ...animals.map((sp) => [
        sp,
        ...zones.map(
          (z) => rows.filter((s) => s.zone === z && s.species === sp).length,
        ),
        rows.filter((s) => s.species === sp).length,
      ]),
    ]);
    notify("Report exported as CSV.");
  }
  return (
    <>
      <Heading
        title="Reports"
        description={
          role === "admin"
            ? "View trends and generate reports on wildlife activity, alerts and system performance."
            : "View activity summaries for your assigned gewogs and your alert response history"
        }
      />
      <div className="filter-bar report-filters">
        <label>
          Date range
          <div className="date-range">
            <input
              type="date"
              aria-label="Report start date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span>–</span>
            <input
              type="date"
              aria-label="Report end date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </label>
        <label>
          Species
          <SpeciesSelect value={species} onChange={setSpecies} />
        </label>
        <label>
          Zone
          <ZoneSelect value={zone} onChange={setZone} />
        </label>
        <button
          className="primary"
          onClick={() => {
            if (from > to) {
              notify("Choose an end date after the start date.");
              return;
            }
            setApplied({ from, to, species, zone });
          }}
        >
          Apply
        </button>
        <button
          onClick={() => {
            setFrom("2026-09-22");
            setTo(TODAY);
            setSpecies("all");
            setZone("all");
            setApplied({
              from: "2026-09-22",
              to: TODAY,
              species: "all",
              zone: "all",
            });
          }}
        >
          Reset
        </button>
      </div>
      <div className={role === "ranger" ? "reports-ranger-grid" : "stack"}>
        <Card
          title={
            role === "admin"
              ? "Wildlife sightings trend"
              : "Wildlife Activity (your gewogs)"
          }
        >
          <div className="chart chart-trend">
            <ResponsiveContainer width="100%" height="100%">
              {role === "admin" ? (
                <LineChart
                  data={trend}
                  margin={{ left: 0, right: 15, top: 12, bottom: 8 }}
                >
                  <CartesianGrid stroke="#e9eded" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend
                    align="right"
                    verticalAlign="middle"
                    layout="vertical"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  {animals.map((s, i) => (
                    <Line
                      key={s}
                      type="linear"
                      dataKey={s}
                      stroke={COLOURS[SPECIES.indexOf(s)]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={trend}>
                  <CartesianGrid stroke="#ebeeee" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {animals.map((s) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      stackId="activity"
                      fill={COLOURS[SPECIES.indexOf(s)]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
        {role === "ranger" && (
          <Card
            title="Activity Summary"
            action={
              <button className="blue-button" onClick={exportReport}>
                <Download size={15} />
                Export
              </button>
            }
          >
            <p className="meta">
              {shortDate(applied.from)} – {shortDate(applied.to)}
            </p>
            <div className="table-scroll"><table>
              <thead>
                <tr>
                  <th>Species</th>
                  {zones.map((z) => (
                    <th key={z}>{ZONES[z]}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {animals.map((sp) => (
                  <tr key={sp}>
                    <td>
                      <span className="species-cell">
                        <Animal species={sp} size={20} />
                        {sp}
                      </span>
                    </td>
                    {zones.map((z) => (
                      <td key={z}>
                        {
                          rows.filter((s) => s.species === sp && s.zone === z)
                            .length
                        }
                      </td>
                    ))}
                    <td>
                      <b>{rows.filter((s) => s.species === sp).length}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
      {role === "admin" ? (
        <div className="reports-bottom">
          <Card title="Species detections (total)">
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={counts} margin={{ top: 20, bottom: 22 }}>
                  <CartesianGrid stroke="#ebeeee" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    height={65}
                    angle={-27}
                    textAnchor="end"
                    tickFormatter={(name: string) =>
                      name.replace("Asian ", "").replace(" (indicative)", "")
                    }
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Sightings"
                    isAnimationActive={false}
                    label={{ position: "top", fontSize: 12 }}
                  >
                    {counts.map((c) => (
                      <Cell
                        key={c.name}
                        fill={COLOURS[SPECIES.indexOf(c.name)]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Alert response status">
            <div className="donut-layout">
              <div className="donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={response}
                      dataKey="value"
                      innerRadius="66%"
                      outerRadius="94%"
                      isAnimationActive={false}
                    >
                      {response.map((r) => (
                        <Cell key={r.name} fill={r.colour} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <span>
                  <b>{alerts.length}</b>Total alerts
                </span>
              </div>
              <div className="donut-legend">
                {response.map((r) => (
                  <p key={r.name}>
                    <i style={{ background: r.colour }} />
                    {r.name}
                    <b>
                      {r.value} (
                      {alerts.length
                        ? Math.round((r.value / alerts.length) * 100)
                        : 0}
                      %)
                    </b>
                  </p>
                ))}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card title="My Alert Response History" className="report-history">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Species</th>
                  <th>Gewog</th>
                  <th>Alert Type</th>
                  <th>Severity</th>
                  <th>My Response</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td>
                      {shortDate(a.date)}, {a.time}
                    </td>
                    <td>{a.species}</td>
                    <td>{ZONES[a.zone]}</td>
                    <td>{a.trigger}</td>
                    <td>
                      <Severity value={a.severity} />
                    </td>
                    <td>
                      {a.response
                        ? "Response recorded"
                        : a.status === "New"
                          ? "Pending"
                          : "Acknowledged"}
                    </td>
                    <td>
                      <Badge tone={a.status === "Resolved" ? "green" : "blue"}>
                        {a.status === "Acknowledged" ? "In progress" : a.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!alerts.length && (
              <Empty text="No alert responses in this period." />
            )}
          </div>
        </Card>
      )}
      <div className="report-footer">
        <Card>
          <Database />
          <div>
            <b>Data source</b>
            <small>Camera detections (recorded demo), ranger reports</small>
          </div>
        </Card>
        <Card>
          <CalendarDays />
          <div>
            <b>Report period</b>
            <small>
              {shortDate(applied.from)} – {shortDate(applied.to)}
            </small>
          </div>
        </Card>
        <Card>
          <div>
            <b>Export report</b>
            <div className="button-row">
              <button className="primary" onClick={() => window.print()}>
                <Download size={16} />
                Export PDF
              </button>
              <button onClick={exportReport}>
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>
        </Card>
      </div>
      <p className="small muted print-note">
        PDF export opens your browser’s print dialog. Select “Save as PDF”.
        Figures are computed from the current local demonstration records.
      </p>
    </>
  );
}
