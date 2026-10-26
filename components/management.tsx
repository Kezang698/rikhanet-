"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Area,
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
import {
  Bell,
  CalendarDays,
  Camera,
  Check,
  Database,
  Download,
  Edit,
  FileText,
  ImageUp,
  Info,
  KeyRound,
  Link,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import {
  csvDownload,
  DATE_LABEL,
  profileInitials,
  seedState,
  shortDate,
  SPECIES,
  TODAY,
  ZONES,
  type AccountProfile,
  type Batch,
  type RangerRecord,
  type Rule,
  type Sighting,
  type Zone,
} from "@/lib/data";
import { useApp } from "./context";
import {
  Animal,
  Badge,
  Card,
  Empty,
  Heading,
  MapPanel,
  Modal,
  Pagination,
  Severity,
  Status,
  Toggle,
  WildlifeImage,
} from "./ui";
import { SpeciesSelect, useVisibleSightings, ZoneSelect } from "./monitoring";

const COLOURS = [
  "#095942",
  "#dfad37",
  "#986633",
  "#99ba9b",
  "#4f9bc6",
  "#89948e",
  "#786e94",
];
export function Reports() {
  const { role, data, notify } = useApp();
  const all = useVisibleSightings();
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
      (role === "admin" || ["GE-1", "GE-2"].includes(a.zone)) &&
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
      ["Species", "GE-1", "GE-2", "GE-3", "GE-4", "Total"],
      ...animals.map((sp) => [
        sp,
        ...Object.keys(ZONES).map(
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
            : "View activity summaries for your assigned zones (GE-1, GE-2) and your alert response history"
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
              : "Wildlife Activity (GE-1, GE-2)"
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
            <table>
              <thead>
                <tr>
                  <th>Species</th>
                  <th>GE-1</th>
                  <th>GE-2</th>
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
                    {["GE-1", "GE-2"].map((z) => (
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
            </table>
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
                  <th>Zone</th>
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
                    <td>{a.zone}</td>
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

function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(value);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function DataReview() {
  const { data, setData, notify } = useApp();
  const [tab, setTab] = useState("images"),
    [species, setSpecies] = useState("all"),
    [selected, setSelected] = useState("S-001"),
    [files, setFiles] = useState<string[]>([]),
    [fileError, setFileError] = useState("");
  const imageRef = useRef<HTMLInputElement>(null),
    csvRef = useRef<HTMLInputElement>(null),
    urls = useRef<string[]>([]);
  useEffect(
    () => () => urls.current.forEach((u) => URL.revokeObjectURL(u)),
    [],
  );
  const demos = data.sightings
    .filter((s) => species === "all" || s.species === species)
    .slice(0, 6);
  const current = demos.find((s) => s.id === selected) ?? demos[0];
  async function uploadCSV(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("Use a CSV smaller than 2 MB.");
      const records = parseCSV((await file.text()).replace(/^\uFEFF/, ""));
      const headings =
        records.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
      const required = [
        "species",
        "date",
        "time",
        "zone",
        "camera",
        "confidence",
      ];
      if (!required.every((h) => headings.includes(h)))
        throw new Error(
          "Required columns: species,date,time,zone,camera,confidence.",
        );
      if (!records.length) throw new Error("The CSV has no data rows.");
      const imported: Sighting[] = records.map((r, i) => {
        const o = Object.fromEntries(
          headings.map((h, j) => [h, (r[j] ?? "").trim()]),
        );
        const c = Number(o.confidence);
        if (
          !SPECIES.includes(o.species) ||
          !Object.keys(ZONES).includes(o.zone) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
          Number.isNaN(Date.parse(o.date)) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ||
          !o.camera ||
          !o.confidence ||
          !Number.isFinite(c) ||
          c < 0 ||
          c > 1
        )
          throw new Error(
            `Row ${i + 2} contains invalid species, zone, date, time, camera or confidence.`,
          );
        return {
          id: `CSV-${Date.now()}-${i}`,
          species: o.species,
          date: o.date,
          time: o.time,
          zone: o.zone as Zone,
          camera: o.camera,
          confidence: c,
          review: "Automatically saved",
          source: "CSV upload",
          note: "Imported demo data; not processed by an AI model.",
        };
      });
      setData((d) => ({
        ...d,
        sightings: [...imported, ...d.sightings],
        batches: [
          {
            id: `B-CSV-${Date.now()}`,
            source: "CSV upload",
            uploaded: "Just now",
            total: imported.length,
            processed: imported.length,
            status: "Saved",
          },
          ...d.batches,
        ],
      }));
      setFileError("");
      notify(`${imported.length} CSV records validated and saved locally.`);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Could not read CSV.");
    }
    if (csvRef.current) csvRef.current.value = "";
  }
  function uploadImages(list: FileList | null) {
    if (!list) return;
    const accepted = [...list].filter(
      (f) => f.type.startsWith("image/") && f.size <= 10_000_000,
    );
    if (!accepted.length) {
      notify("Select image files up to 10 MB each.");
      return;
    }
    const preview = accepted.map((f) => URL.createObjectURL(f));
    urls.current.push(...preview);
    setFiles((f) => [...preview, ...f]);
    setData((d) => ({
      ...d,
      batches: [
        {
          id: `B-UPLOAD-${Date.now()}`,
          source: "Local image upload",
          uploaded: "Just now",
          total: accepted.length,
          processed: 0,
          status: "Awaiting AI backend",
        },
        ...d.batches,
      ],
    }));
    notify("Images previewed. AI processing requires the future backend.");
    if (imageRef.current) imageRef.current.value = "";
  }
  return (
    <>
      <Heading
        title="Data Review"
        description="Automatically process camera images and uploads, detect wildlife, and save results."
      />
      <div className="review-toolbar">
        <div className="tabs">
          <button
            className={tab === "images" ? "active" : ""}
            onClick={() => setTab("images")}
          >
            Image Processing
          </button>
          <button
            className={tab === "csv" ? "active" : ""}
            onClick={() => setTab("csv")}
          >
            CSV Upload
          </button>
        </div>
        <button
          className="primary"
          onClick={() =>
            tab === "images"
              ? imageRef.current?.click()
              : csvRef.current?.click()
          }
        >
          <Upload size={17} />
          {tab === "images" ? "Upload Images" : "Upload CSV"}
        </button>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => uploadImages(e.target.files)}
        />
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => uploadCSV(e.target.files?.[0])}
        />
      </div>
      {tab === "csv" && (
        <Card title="Import observation records" className="csv-guide">
          <p>
            Use the columns{" "}
            <code>species,date,time,zone,camera,confidence</code>. Imported
            records save automatically in Sightings.
          </p>
          <div className="button-row">
            <button
              onClick={() =>
                csvDownload("rikhanet-import-example.csv", [
                  ["species", "date", "time", "zone", "camera", "confidence"],
                  ["Asian Elephant", TODAY, "06:24", "GE-2", "CAM-012", 0.92],
                ])
              }
            >
              <Download size={16} />
              Download example CSV
            </button>
            <button className="primary" onClick={() => csvRef.current?.click()}>
              Choose CSV file
            </button>
          </div>
          {fileError && (
            <p className="form-error" role="alert">
              {fileError}
            </p>
          )}
        </Card>
      )}
      <Card title="Processing queue" className="processing-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Source</th>
                <th>Uploaded</th>
                <th>Total images / records</th>
                <th>Processed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>{b.source}</td>
                  <td>{b.uploaded}</td>
                  <td>{b.total}</td>
                  <td>{b.processed}</td>
                  <td>
                    <Status status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {files.length > 0 && (
        <Card
          title="Your uploaded images — awaiting AI backend"
          className="uploaded-card"
        >
          <div className="uploaded-grid">
            {files.map((url, i) => (
              <img key={url} src={url} alt={`Uploaded image ${i + 1}`} />
            ))}
          </div>
          <p className="muted small">
            Previewed in this tab only. No species or confidence has been
            inferred.
          </p>
        </Card>
      )}
      <div className="review-grid">
        <Card
          title={
            <>
              Automatically saved detections <Info size={16} />
            </>
          }
        >
          <SpeciesSelect value={species} onChange={setSpecies} />
          <div className="detection-grid">
            {demos.map((s) => (
              <button
                key={s.id}
                className={current?.id === s.id ? "selected" : ""}
                onClick={() => setSelected(s.id)}
              >
                <WildlifeImage sighting={s} box label />
                <small>
                  {s.camera}_0928_{s.time.replace(":", "")}.jpg
                </small>
                <b>
                  {s.species} {s.confidence.toFixed(2)}
                </b>
                {s.confidence < 0.7 && (
                  <Badge tone="yellow">Uncertain detection</Badge>
                )}
              </button>
            ))}
          </div>
        </Card>
        {current && (
          <Card title="Detection result">
            <WildlifeImage sighting={current} box label />
            <dl className="details lined">
              <dt>Species</dt>
              <dd>{current.species}</dd>
              <dt>Confidence</dt>
              <dd>{current.confidence.toFixed(2)}</dd>
              <dt>Status</dt>
              <dd>
                <Status status="Automatically saved" />
              </dd>
              <dt>Saved to</dt>
              <dd>
                sightings · {DATE_LABEL}, {current.time}
              </dd>
            </dl>
            <p className="muted small">
              Sample processing results from the prototype. New image uploads
              need the future detection service.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

export function Rangers() {
  const { data, setData, dialog, notify } = useApp();
  const [q, setQ] = useState(""),
    [zone, setZone] = useState("all"),
    [status, setStatus] = useState("all"),
    [id, setId] = useState("RNG-001");
  const filtered = data.rangers.filter(
    (r) =>
      (zone === "all" || r.zones.includes(zone as Zone)) &&
      (status === "all" || r.status === status) &&
      `${r.name} ${r.id} ${r.zones}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selected = filtered.find((r) => r.id === id) ?? filtered[0];
  function edit(r?: RangerRecord) {
    dialog({
      title: r ? "Edit ranger details" : "Add ranger",
      description:
        "Creates a local staff record for the prototype. Organization account provisioning will need the backend.",
      fields: [
        { name: "name", label: "Full name", value: r?.name },
        {
          name: "id",
          label: "Staff ID",
          value:
            r?.id ?? `RNG-${String(data.rangers.length + 1).padStart(3, "0")}`,
        },
        {
          name: "role",
          label: "Role",
          type: "select",
          value: r?.role,
          options: ["Field Ranger", "Senior Ranger", "Camera Technician"],
        },
        {
          name: "zones",
          label: "Assigned zones (comma separated)",
          value: r?.zones.join(", ") ?? "GE-1",
        },
        { name: "email", label: "Work email", type: "email", value: r?.email },
        { name: "phone", label: "Work contact", value: r?.phone ?? "+975 " },
        {
          name: "status",
          label: "Status",
          type: "select",
          value: r?.status,
          options: ["Active", "Suspended"],
        },
        {
          name: "notes",
          label: "Notes",
          type: "textarea",
          value: r?.notes,
          required: false,
        },
      ],
      submit: r ? "Save changes" : "Add ranger",
      onSave: (v) => {
        const zones = v.zones.split(",").map((z) => z.trim()) as Zone[];
        if (zones.some((z) => !Object.keys(ZONES).includes(z))) {
          notify("Use zone codes GE-1, GE-2, GE-3 or GE-4.");
          return;
        }
        if (data.rangers.some((x) => x.id === v.id && x.id !== r?.id)) {
          notify("That staff ID already exists.");
          return;
        }
        const record: RangerRecord = {
          id: v.id,
          name: v.name,
          role: v.role,
          zones: [...new Set(zones)],
          email: v.email,
          phone: v.phone,
          status: v.status as RangerRecord["status"],
          notes: v.notes,
        };
        setData((d) => ({
          ...d,
          rangers: r
            ? d.rangers.map((x) => (x.id === r.id ? record : x))
            : [...d.rangers, record],
        }));
        setId(record.id);
        notify("Ranger record saved.");
      },
    });
  }
  return (
    <>
      <Heading
        title="Rangers"
        description="Manage field staff, contact details and zone assignments."
      >
        <button className="primary" onClick={() => edit()}>
          <Plus size={18} />
          Add Ranger
        </button>
      </Heading>
      <div className="filter-bar ranger-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search rangers"
            placeholder="Search by name, staff ID or zone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <ZoneSelect value={zone} onChange={setZone} />
        <select
          aria-label="Filter ranger status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option>Active</option>
          <option>Suspended</option>
        </select>
      </div>
      <div className="rangers-grid">
        <Card className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Staff ID</th>
                  <th>Role</th>
                  <th>Assigned Zones</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setId(r.id);
                    }}
                    className={selected?.id === r.id ? "row-green" : ""}
                  >
                    <td>{r.name}</td>
                    <td>{r.id}</td>
                    <td>{r.role}</td>
                    <td>{r.zones.join(", ")}</td>
                    <td>
                      <Status status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <Empty />}
          </div>
          <p className="table-count">
            Showing {filtered.length} of {data.rangers.length} rangers
          </p>
        </Card>
        {selected && (
          <Card
            title={selected.name}
            action={
              <Badge>
                <Status status={selected.status} />
              </Badge>
            }
          >
            <dl className="stacked-details">
              <dt>Staff ID</dt>
              <dd>{selected.id}</dd>
              <dt>Role</dt>
              <dd>{selected.role}</dd>
              <dt>Assigned Zones</dt>
              <dd className="zone-tags">
                {selected.zones.map((z) => (
                  <span key={z}>
                    <b>{z}</b> {ZONES[z]}
                  </span>
                ))}
              </dd>
              <dt>Work contact</dt>
              <dd>
                {selected.email}
                <br />
                {selected.phone}
              </dd>
              <dt>Notes</dt>
              <dd className="notes-box">
                {selected.notes || "No notes added."}
              </dd>
            </dl>
            <h3>Actions</h3>
            <div className="button-row wrap">
              <button onClick={() => edit(selected)}>
                <Edit size={15} />
                Edit Details
              </button>
              <button
                className="danger-outline"
                onClick={() => {
                  const next =
                    selected.status === "Active" ? "Suspended" : "Active";
                  dialog({
                    title:
                      next === "Suspended"
                        ? "Deactivate ranger"
                        : "Reactivate ranger",
                    description: `${selected.name} will be marked ${next.toLowerCase()} in this demo.`,
                    submit: next === "Suspended" ? "Deactivate" : "Reactivate",
                    onSave: () => {
                      setData((d) => ({
                        ...d,
                        rangers: d.rangers.map((r) =>
                          r.id === selected.id ? { ...r, status: next } : r,
                        ),
                      }));
                      notify("Ranger status updated.");
                    },
                  });
                }}
              >
                {selected.status === "Active"
                  ? "Deactivate Ranger"
                  : "Reactivate Ranger"}
              </button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export function Rules() {
  const { data, setData, notify, dialog } = useApp();
  const [id, setId] = useState("R-001"),
    [tab, setTab] = useState("zones");
  const selected = data.rules.find((r) => r.id === id) ?? data.rules[0];
  const [name, setName] = useState(selected.name),
    [distance, setDistance] = useState(String(selected.distance)),
    [recipients, setRecipients] = useState(selected.recipients);
  useEffect(() => {
    setName(selected.name);
    setDistance(String(selected.distance));
    setRecipients(selected.recipients);
  }, [selected.id, selected.name, selected.distance, selected.recipients]);
  function toggle(r: Rule, v: boolean) {
    setData((d) => ({
      ...d,
      rules: d.rules.map((x) =>
        x.id === r.id
          ? {
              ...x,
              enabled: v,
              history: [
                `Now — Rule ${v ? "enabled" : "disabled"} by Admin`,
                ...x.history,
              ],
            }
          : x,
      ),
    }));
  }
  function add() {
    dialog({
      title: "Add alert rule",
      fields: [
        { name: "name", label: "Rule name" },
        {
          name: "kind",
          label: "Condition",
          type: "select",
          options: ["Elephant near settlement", "Repeated wildlife detections"],
        },
        {
          name: "value",
          label: "Distance in km or repeated detection count",
          type: "number",
          value: "2",
          min: 0.1,
          max: 100,
          step: "0.1",
        },
        {
          name: "recipients",
          label: "Notification recipients",
          value: "Rangers (relevant zone), Admin Team",
        },
        {
          name: "severity",
          label: "Severity",
          type: "select",
          options: ["High", "Medium", "Low"],
        },
      ],
      submit: "Create rule",
      onSave: (v) => {
        const rule: Rule = {
          id: `R-${Date.now()}`,
          name: v.name,
          distance: Number(v.value),
          kind: v.kind.startsWith("Elephant") ? "distance" : "repeat",
          enabled: true,
          severity: v.severity,
          recipients: v.recipients,
          history: ["Now — Rule created by Admin"],
        };
        setData((d) => ({ ...d, rules: [...d.rules, rule] }));
        setId(rule.id);
        notify("Demo rule created.");
      },
    });
  }
  return (
    <>
      <Heading
        title="Zones & Alert Rules"
        description="Define monitoring zones and configure automated alert rules."
      />
      <div className="tabs pill-tabs">
        <button
          className={tab === "zones" ? "active" : ""}
          onClick={() => setTab("zones")}
        >
          Monitoring Zones
        </button>
        <button
          className={tab === "rules" ? "active" : ""}
          onClick={() => setTab("rules")}
        >
          Alert Rules
        </button>
      </div>
      <div className={`rules-grid ${tab === "rules" ? "rules-only" : ""}`}>
        {tab === "zones" && (
          <Card title="Proposed Gelephu Monitoring Zones">
            <MapPanel mode="zones" />
            <p className="muted small">
              The basemap shows real Gelephu geography. GE sector circles are
              illustrative; official boundaries require surveyed GIS data.
            </p>
          </Card>
        )}
        <div className="stack">
          <Card
            title="Alert Rules"
            action={
              <button className="primary" onClick={add}>
                <Plus size={17} />
                Add Rule
              </button>
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Condition</th>
                    <th>Recipients</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => (
                    <tr key={r.id} className={id === r.id ? "row-green" : ""}>
                      <td>
                        <button
                          className="cell-button"
                          onClick={() => setId(r.id)}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td>
                        {r.kind === "distance"
                          ? `Elephant within ${r.distance} km of settlement zone`
                          : `Same species detected ≥ ${r.distance} times in 1 hour`}
                      </td>
                      <td>{r.recipients}</td>
                      <td>
                        <Toggle
                          checked={r.enabled}
                          onChange={(v) => toggle(r, v)}
                          label={`Enable ${r.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="rule-edit-grid">
            <Card
              title="Edit Rule"
              action={
                <Toggle
                  checked={selected.enabled}
                  onChange={(v) => toggle(selected, v)}
                  label="Selected rule status"
                />
              }
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setData((d) => ({
                    ...d,
                    rules: d.rules.map((r) =>
                      r.id === id
                        ? {
                            ...r,
                            name,
                            distance: Number(distance),
                            recipients,
                            history: [
                              "Now — Rule updated by Admin",
                              ...r.history,
                            ],
                          }
                        : r,
                    ),
                  }));
                  notify("Rule changes saved in the local demo.");
                }}
              >
                <label className="field-label">
                  Rule Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label className="field-label">
                  Condition
                  <p>
                    Trigger an alert when{" "}
                    {selected.kind === "distance"
                      ? "an elephant is detected within the settlement buffer"
                      : "the same species is detected repeatedly"}
                    :
                  </p>
                  <div className="inline-field">
                    <input
                      aria-label="Rule distance or count"
                      type="number"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      required
                    />
                    <span>
                      {selected.kind === "distance"
                        ? "kilometres"
                        : "times in one hour"}
                    </span>
                  </div>
                </label>
                <label className="field-label">
                  Notification Recipients
                  <input
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    required
                  />
                </label>
                <div className="button-row">
                  <button type="submit" className="primary">
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setName(selected.name);
                      setDistance(String(selected.distance));
                      setRecipients(selected.recipients);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Card>
            <Card title="Change History">
              <ol className="timeline compact-timeline">
                {selected.history.map((h, i) => (
                  <li className="done" key={i}>
                    {h}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { data, setData, dialog, notify, go } = useApp();
  function configure(kind: string) {
    const field =
      kind === "detection"
        ? {
            name: "threshold",
            label: "Detection confidence threshold",
            value: String(data.config.threshold),
            min: 0,
            max: 1,
            step: "0.01",
          }
        : kind === "prediction"
          ? {
              name: "advisory",
              label: "Forecast advisory threshold (%)",
              value: String(data.config.advisory),
              min: 0,
              max: 100,
              step: "1",
            }
          : {
              name: "interval",
              label: "Planned refresh interval (hours)",
              value: String(data.config.interval),
              min: 1,
              max: 24,
              step: "1",
            };
    dialog({
      title:
        kind === "detection"
          ? "Detection model settings"
          : kind === "prediction"
            ? "Prediction settings"
            : "Ingestion settings",
      description:
        "Demo configuration only. No model or service runs in this UI.",
      fields: [{ ...field, type: "number" }],
      onSave: (v) => {
        setData((d) => ({
          ...d,
          config: { ...d.config, [field.name]: Number(v[field.name]) },
        }));
        notify("Demo configuration saved.");
      },
    });
  }
  const logs = [
    "Camera data ingested: CAM-012",
    "Prediction service completed",
    "Camera CAM-014 offline",
    "Alert sent: Elephant near settlement",
    "Model inference completed",
  ];
  return (
    <>
      <Heading
        title="Settings & System Status"
        description="View system status, model configuration and system settings."
      />
      <div className="settings-grid">
        <Card
          title={
            <>
              <ShieldCheck />
              Wildlife Detection Model
              <br />
              YOLOv11 candidate
            </>
          }
        >
          <Badge tone="blue">Testing</Badge>
          <p>
            New model under evaluation for wildlife detection in Gelephu region.
          </p>
          <dl className="details">
            <dt>Status</dt>
            <dd>Research preview</dd>
            <dt>Model version</dt>
            <dd>v11 (candidate)</dd>
            <dt>Configured for</dt>
            <dd>Asian Elephants, Tigers, Leopards, Gaur, Wild Boar, Others</dd>
          </dl>
          <button onClick={() => configure("detection")}>
            View Model Settings
          </button>
        </Card>
        <Card
          title={
            <>
              <TrendingUp />
              Prediction Service
            </>
          }
        >
          <Badge tone="blue">Research Preview</Badge>
          <p>
            Early research version of spatiotemporal hotspot prediction service.
          </p>
          <dl className="details">
            <dt>Status</dt>
            <dd className="green">Demo snapshot</dd>
            <dt>Last run</dt>
            <dd>28 Sep 2026, 08:00</dd>
            <dt>Next run</dt>
            <dd>28 Sep 2026, 14:00</dd>
          </dl>
          <button onClick={() => configure("prediction")}>
            View Prediction Settings
          </button>
        </Card>
        <Card
          title={
            <>
              <Database />
              Data Ingestion
            </>
          }
        >
          <Badge tone="yellow">Planned</Badge>
          <p>Camera data ingestion and processing pipeline.</p>
          <dl className="details">
            <dt>Status</dt>
            <dd>Planned (not live)</dd>
            <dt>Last data update</dt>
            <dd>—</dd>
            <dt>Planned live date</dt>
            <dd>15 Oct 2026</dd>
          </dl>
          <button onClick={() => configure("ingestion")}>
            View Ingestion Settings
          </button>
        </Card>
        <Card
          title={
            <>
              <Bell />
              Notification Delivery
            </>
          }
        >
          <Badge>Demo only</Badge>
          <p>
            Proposed alerts for rangers and administrators. This prototype
            displays in-app demo notifications.
          </p>
          <dl className="details">
            <dt>Status</dt>
            <dd>Local preview</dd>
            <dt>Last test</dt>
            <dd>28 Sep 2026, 10:05</dd>
          </dl>
          <button
            onClick={() =>
              notify(
                "Test notification: Elephant detected in GE-2 (demonstration only).",
              )
            }
          >
            Send Test Notification
          </button>
        </Card>
        <Card
          title={
            <>
              <FileText />
              Technical Logs
            </>
          }
        >
          <p className="small">Illustrative system logs from the prototype.</p>
          <div className="technical-logs">
            {logs.map((l, i) => (
              <p key={l}>
                <span>28 Sep 08:{12 - i}</span>
                <b>{i === 2 ? "[WARN]" : "[INFO]"}</b>
                {l}
              </p>
            ))}
          </div>
          <button
            onClick={() =>
              dialog({
                title: "Technical logs",
                description:
                  logs
                    .map((l, i) => `28 Sep 2026, 08:${12 - i} — ${l}`)
                    .join("\n") +
                  "\n\nThese are sample records; no backend services are connected.",
                submit: "Close",
              })
            }
          >
            View Full Logs
          </button>
        </Card>
        <Card
          title={
            <>
              <Link />
              Data Source Connection
            </>
          }
        >
          <Badge tone="yellow">Planned</Badge>
          <p>Connection to camera network and data storage.</p>
          <dl className="details">
            <dt>Camera network</dt>
            <dd>Planned (12/12 cameras)</dd>
            <dt>Storage</dt>
            <dd>Planned</dd>
            <dt>Database</dt>
            <dd>Planned</dd>
          </dl>
          <button
            onClick={() =>
              dialog({
                title: "Connection settings",
                description:
                  "Live camera, PostgreSQL, PostGIS and AI service connections will be added with the backend. This frontend uses browser demonstration data only.",
                submit: "Close",
              })
            }
          >
            View Connection Settings
          </button>
        </Card>
      </div>
      <button
        className="text-button reset-demo"
        onClick={() =>
          dialog({
            title: "Reset demonstration data",
            description:
              "This resets local sightings, demo alerts, staff records, profiles, preferences and rules to the original sample. Your source files stay unchanged.",
            submit: "Reset demo data",
            onSave: () => {
              setData(seedState());
              notify("Demonstration data reset.");
              go("overview");
            },
          })
        }
      >
        Reset demonstration data
      </button>
    </>
  );
}

function ProfileEditor({
  profile,
  onClose,
  onSave,
}: {
  profile: AccountProfile;
  onClose: () => void;
  onSave: (details: Pick<AccountProfile, "name" | "email" | "phone">) => void;
}) {
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const phone = String(values.get("phone") ?? "").trim();
    if (!name || !email) {
      setError("Enter your full name and contact email.");
      return;
    }
    onSave({ name, email, phone });
  }

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={save} onInput={() => setError("")}>
        <p className="dialog-description">
          Update your name and work contact details. Demo sign-in details stay
          the same.
        </p>
        <div className="form-fields">
          <label>
            Full name <span className="required">*</span>
            <input
              name="name"
              defaultValue={profile.name}
              autoComplete="name"
              maxLength={80}
              required
            />
          </label>
          <label>
            Contact email <span className="required">*</span>
            <input
              name="email"
              type="email"
              defaultValue={profile.email}
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Phone number (optional)
            <input
              name="phone"
              type="tel"
              defaultValue={profile.phone}
              autoComplete="tel"
              maxLength={40}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">{error}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Account() {
  const { role, data, setData, dialog, notify, signOut } = useApp();
  const ranger = role === "ranger";
  const profile = data.profiles[role];
  const [editingProfile, setEditingProfile] = useState(false);
  const prefs = ranger
    ? [
        "Wildlife alerts (assigned zones)",
        "Daily activity summary",
        "System announcements",
        "Camera status alerts",
      ]
    : [
        "System alerts",
        "Wildlife alerts",
        "Daily summaries",
        "Product updates",
      ];
  const descriptions = ranger
    ? [
        "Elephant, leopard and other key species in your assigned zones",
        "Daily email summary of your field activity",
        "Important system notifications and announcements",
        "Camera connectivity and status in your assigned zones",
      ]
    : [
        "Important system notifications and errors",
        "High priority wildlife detection alerts",
        "Daily email summary of key events",
        "News about new features and improvements",
      ];
  function password() {
    dialog({
      title: "Change password — UI preview",
      description:
        "This is a form demonstration. The demo login password remains Demo@123; real password changes require the authentication backend.",
      fields: [
        { name: "current", label: "Current password", type: "password" },
        { name: "next", label: "New password", type: "password" },
        { name: "confirm", label: "Confirm new password", type: "password" },
      ],
      submit: "Preview change",
      onSave: (v) => {
        notify(
          v.next !== v.confirm
            ? "The new passwords do not match."
            : v.next.length < 8
              ? "Use at least 8 characters."
              : "Password form validated. No real account was changed.",
        );
      },
    });
  }
  return (
    <>
      <Heading
        title="My Account"
        description="Manage your account settings, security and notification preferences."
      />
      <div className="account-grid">
        <div className="stack">
          <Card
            title="Account Information"
            className="account-information"
            action={
              <button onClick={() => setEditingProfile(true)}>
                <Edit size={16} /> Edit Profile
              </button>
            }
          >
            <div className="profile">
              <span className="avatar-large">
                {profileInitials(profile.name)}
              </span>
              <div>
                <h2>{profile.name}</h2>
                <Badge tone="blue">{role.toUpperCase()}</Badge>
                <p>{profile.email}</p>
              </div>
            </div>
            <dl className="details roomy">
              <dt>Phone number</dt>
              <dd>{profile.phone || "Not provided"}</dd>
              {ranger && (
                <>
                  <dt>Assigned zones</dt>
                  <dd>GE-1 — Gelephu Core, GE-2 — East Corridor</dd>
                </>
              )}
              <dt>Account created</dt>
              <dd>01 Mar 2025</dd>
              <dt>Last login</dt>
              <dd>28 Sep 2026, 08:12</dd>
            </dl>
            {ranger && (
              <div className="info-box">
                <LockKeyhole size={18} />
                Assigned zones are read-only and managed by the system
                administrator.
              </div>
            )}
          </Card>
          <Card
            title={
              <>
                <LockKeyhole />
                Security Settings
              </>
            }
          >
            <div className="security-item">
              <b>Password</b>
              <p>
                Update your password regularly to keep your account secure.
              </p>
              <button onClick={password}>Change Password</button>
            </div>
            <div className="security-item">
              <b>Two-Factor Authentication</b>
              <p>Add an extra layer of security to your account.</p>
              <button
                onClick={() =>
                  dialog({
                    title: "Two-factor authentication",
                    description:
                      "The production account will support verification setup. This frontend cannot enable real two-factor authentication.",
                    submit: "Close",
                  })
                }
              >
                Enable 2FA
              </button>
            </div>
            {ranger && (
              <p className="meta">Last changed &nbsp; 12 Aug 2026, 14:32</p>
            )}
          </Card>
          <Card
            title={
              <>
                <KeyRound />
                Password Recovery
              </>
            }
          >
            <p>Set up recovery options to regain access to your account.</p>
            <div className="button-row wrap">
              <span className="small recovery-email">
                Recovery email &nbsp; {profile.recoveryEmail}
              </span>
              <button
                onClick={() =>
                  dialog({
                    title: "Update recovery email",
                    description:
                      "Save the recovery contact in this prototype. No email will be sent.",
                    fields: [
                      {
                        name: "email",
                        label: "Recovery email",
                        type: "email",
                        value: profile.recoveryEmail,
                      },
                    ],
                    submit: "Save changes",
                    onSave: (values) => {
                      setData((d) => ({
                        ...d,
                        profiles: {
                          ...d.profiles,
                          [role]: {
                            ...d.profiles[role],
                            recoveryEmail: values.email.trim(),
                          },
                        },
                      }));
                      notify("Recovery email updated in this browser.");
                    },
                  })
                }
              >
                Update Recovery Email
              </button>
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card
            title={
              <>
                <Bell />
                Notification Preferences
              </>
            }
          >
            <p className="muted">
              Choose what notifications you want to receive.
            </p>
            <div className="preferences">
              {prefs.map((p, i) => (
                <label key={p}>
                  <span>
                    <b>{p}</b>
                    <small>{descriptions[i]}</small>
                  </span>
                  <Toggle
                    checked={data.preferences[`${role}-${p}`] ?? false}
                    onChange={(v) =>
                      setData((d) => ({
                        ...d,
                        preferences: {
                          ...d.preferences,
                          [`${role}-${p}`]: v,
                        },
                      }))
                    }
                    label={p}
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card title="Recent Account Activity">
            <p className="muted">
              Illustrative login activity and account actions.
            </p>
            <table>
              <tbody>
                {[
                  "Logged in",
                  "Updated notification preferences",
                  "Changed password",
                  "Logged in",
                ].map((t, i) => (
                  <tr key={i}>
                    <td>{28 - i * 2} Sep 2026, 08:12</td>
                    <td>{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <button
              className="danger-outline full-width signout-button"
              onClick={signOut}
            >
              <LogOut size={21} />
              Sign out
            </button>
            {ranger && (
              <div className="info-box">
                <Info size={20} />
                Your account is for authorized use only. Activity may be
                monitored in accordance with RiKhaNET policies.
              </div>
            )}
          </Card>
        </div>
      </div>
      {editingProfile && (
        <ProfileEditor
          profile={profile}
          onClose={() => setEditingProfile(false)}
          onSave={(details) => {
            setData((d) => ({
              ...d,
              profiles: {
                ...d.profiles,
                [role]: { ...d.profiles[role], ...details },
              },
            }));
            setEditingProfile(false);
            notify("Profile updated in this browser.");
          }}
        />
      )}
    </>
  );
}
