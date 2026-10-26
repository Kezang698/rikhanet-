"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  Download,
  Edit,
  ExternalLink,
  FileText,
  Flag,
  Info,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import {
  csvDownload,
  DATE_LABEL,
  shortDate,
  SPECIES,
  TODAY,
  ZONES,
  type AlertRecord,
  type CameraRecord,
  type Sighting,
  type Zone,
} from "@/lib/data";
import { useApp } from "./context";
import { cameraLocation, formatCoordinates, GELEPHU_CENTER, locationLabel, sightingLocation } from "@/lib/maps";
import {
  Animal,
  Artwork,
  Badge,
  Card,
  Details,
  Empty,
  Heading,
  MapPanel,
  Pagination,
  Severity,
  Status,
  WildlifeImage,
} from "./ui";

export function useVisibleSightings() {
  const { role, data } = useApp();
  return useMemo(
    () =>
      data.sightings.filter(
        (s) => role === "admin" || s.zone === "GE-1" || s.zone === "GE-2",
      ),
    [role, data.sightings],
  );
}
export function ZoneSelect({
  value,
  onChange,
  all = true,
}: {
  value: string;
  onChange: (s: string) => void;
  all?: boolean;
}) {
  const { role } = useApp();
  return (
    <select
      aria-label="Filter by zone"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && (
        <option value="all">
          {role === "ranger" ? "GE-1, GE-2 (assigned)" : "All Zones"}
        </option>
      )}
      {Object.entries(ZONES)
        .filter(([z]) => role === "admin" || z === "GE-1" || z === "GE-2")
        .map(([z, name]) => (
          <option key={z} value={z}>
            {z} — {name}
          </option>
        ))}
    </select>
  );
}
export function SpeciesSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select
      aria-label="Filter by species"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All Species</option>
      {SPECIES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}
export function Overview() {
  const { role, data, go, setSelectedId } = useApp();
  const ranger = role === "ranger";
  const sightings = useVisibleSightings();
  const alerts = data.alerts.filter(
    (a) => !ranger || ["GE-1", "GE-2"].includes(a.zone),
  );
  const online = data.cameras.filter(
    (c) =>
      c.status === "Online" && (!ranger || ["GE-1", "GE-2"].includes(c.zone)),
  ).length;
  const total = data.cameras.filter(
    (c) => !ranger || ["GE-1", "GE-2"].includes(c.zone),
  ).length;
  const stats = ranger
    ? [
        {
          title: "Assigned Zones",
          value: "GE-1, GE-2",
          note: "Gelephu Core, East Corridor",
          icon: MapPin,
          view: "map" as const,
        },
        {
          title: "New Alerts",
          value: alerts.filter((a) => a.status === "New").length,
          note: "Since last login",
          icon: AlertTriangle,
          view: "alerts" as const,
          danger: true,
        },
        {
          title: "Latest Elephant Sighting",
          value: "28 Sep 2026, 06:24",
          note: "GE-2 — East Corridor · CAM-012",
          icon: null,
          view: "sightings" as const,
        },
        {
          title: "Cameras Online",
          value: `${online} / ${total}`,
          note: "Your zones: GE-1, GE-2",
          icon: Camera,
          view: "cameras" as const,
        },
      ]
    : [
        {
          title: "Recent Sightings",
          value: data.sightings.length,
          note: "Last 7 days",
          icon: null,
          view: "sightings" as const,
        },
        {
          title: "Open Alerts",
          value: alerts.filter(
            (a) => a.status !== "Resolved" && a.severity !== "Low",
          ).length,
          note: "Active · high and medium",
          icon: AlertTriangle,
          view: "alerts" as const,
          danger: true,
        },
        {
          title: "Reporting Cameras",
          value: `${online} / ${total}`,
          note: "Online",
          icon: Camera,
          view: "cameras" as const,
        },
        {
          title: "Pending Reviews",
          value: data.sightings.filter((s) => s.review === "Needs review")
            .length,
          note: "Sightings",
          icon: FileText,
          view: "review" as const,
        },
      ];
  return (
    <>
      <Heading
        title={ranger ? "Ranger Overview" : "Admin Overview"}
        description={
          ranger
            ? "Your assigned zones and latest wildlife activity"
            : "System-wide summary for Gelephu and surrounding landscape"
        }
      />
      <div className="stats-grid">
        {stats.map((s, i) => (
          <button
            key={s.title}
            className="stat-card"
            onClick={() => go(s.view)}
          >
            <span className={s.danger ? "stat-icon danger" : "stat-icon"}>
              {s.icon ? (
                <s.icon size={38} fill={s.danger ? "currentColor" : "none"} />
              ) : (
                <Animal size={43} />
              )}
            </span>
            <span>
              <span className="stat-label">{s.title}</span>
              <strong
                className={
                  typeof s.value === "string" && s.value.length > 16
                    ? "small-stat"
                    : ""
                }
              >
                {s.value}
              </strong>
              <small>{s.note}</small>
              <span className={`stat-trend ${s.danger ? "red" : ""}`}>
                {i === 0 && !ranger
                  ? "↑ 12% vs previous week"
                  : s.view === "cameras"
                    ? `${Math.round((online / total) * 100)}% operational`
                    : s.view === "review"
                      ? "↓ 26% vs previous week"
                      : ranger && i === 2
                        ? "View details →"
                        : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <Card
          title={
            ranger
              ? "Assigned Zones and Recent Activity"
              : "Recent Activity Around Gelephu"
          }
          className="map-card"
        >
          <MapPanel
            onSightingSelect={(id) => {
              setSelectedId(id);
              go("map");
            }}
            onSelect={(zone) => {
              setSelectedId(
                sightings.find((s) => s.zone === zone)?.id ?? "S-001",
              );
              go("map");
            }}
          />
        </Card>
        <Card
          title={ranger ? "Recent Events (GE-1, GE-2)" : "Recent Activity Feed"}
          action={
            <button className="text-button" onClick={() => go("sightings")}>
              View all
            </button>
          }
        >
          <div className="activity-feed">
            {sightings.slice(0, 2).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  go("sightings");
                }}
              >
                <Animal species={s.species} size={35} />
                <span>
                  <b>{s.species} detected</b>
                  <small>
                    {s.zone} — {ZONES[s.zone]}
                  </small>
                  <small>
                    {shortDate(s.date)}, {s.time}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            <button onClick={() => go("cameras")}>
              <Camera size={34} />
              <span>
                <b>Camera CAM-018 back online</b>
                <small>GE-1 — Gelephu Core</small>
                <small>28 Sep 2026, 02:03</small>
              </span>
            </button>
            <button
              onClick={() => {
                setSelectedId("S-002");
                go("sightings");
              }}
            >
              <Animal species="Wild Boar" size={35} />
              <span>
                <b>Wild Boar detected</b>
                <small>GE-1 — Gelephu Core</small>
                <small>28 Sep 2026, 01:16</small>
              </span>
            </button>
            <button onClick={() => go("alerts")}>
              <AlertTriangle size={38} className="red" />
              <span>
                <b>New alert: Elephant near settlement</b>
                <small>GE-2 — East Corridor</small>
                <small>28 Sep 2026, 06:24</small>
              </span>
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function Sightings() {
  const { role, data, setData, selectedId, setSelectedId, notify, dialog } =
    useApp();
  const visible = useVisibleSightings();
  const [q, setQ] = useState(""),
    [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [source, setSource] = useState("all"),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [from, setFrom] = useState("2026-09-22"),
    [to, setTo] = useState(TODAY),
    [note, setNote] = useState("");
  const filtered = visible.filter(
    (s) =>
      (species === "all" || s.species === species) &&
      (zone === "all" || s.zone === zone) &&
      (source === "all" || s.source === source) &&
      (status === "all" || s.review === status) &&
      (!from || s.date >= from) &&
      (!to || s.date <= to) &&
      `${s.species} ${s.camera} ${s.zone}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  useEffect(() => {
    setPage(1);
  }, [q, species, zone, source, status, from, to]);
  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];
  useEffect(
    () => setNote(selected?.note ?? ""),
    [selected?.id, selected?.note],
  );
  function changeReview(review: Sighting["review"]) {
    if (!selected) return;
    setData((d) => ({
      ...d,
      sightings: d.sightings.map((s) =>
        s.id === selected.id ? { ...s, review, note } : s,
      ),
    }));
    notify(`Sighting ${review.toLowerCase()}. Audit note saved locally.`);
  }
  function fieldReport() {
    dialog({
      title: "Report field sighting",
      description:
        "Add a demonstration observation to your assigned zone. This form stores data in this browser.",
      fields: [
        { name: "species", label: "Species", type: "select", options: SPECIES },
        {
          name: "zone",
          label: "Zone",
          type: "select",
          options: ["GE-1", "GE-2"],
        },
        { name: "date", label: "Date", type: "date", value: TODAY },
        { name: "note", label: "Field notes", type: "textarea" },
      ],
      submit: "Save sighting",
      onSave: (v) => {
        const record: Sighting = {
          id: `S-${Date.now()}`,
          species: v.species,
          zone: v.zone as Zone,
          date: v.date,
          time: "12:00",
          camera: "Field report",
          confidence: 0,
          review: "Needs review",
          source: "Ranger report",
          note: v.note,
        };
        setData((d) => ({ ...d, sightings: [record, ...d.sightings] }));
        setSelectedId(record.id);
        notify("Field sighting saved for admin review.");
      },
    });
  }
  function exportRows() {
    csvDownload("rikhanet-sightings.csv", [
      [
        "ID",
        "Species",
        "Date",
        "Time",
        "Zone",
        "Camera",
        "Confidence",
        "Review",
        "Source",
      ],
      ...filtered.map((s) => [
        s.id,
        s.species,
        s.date,
        s.time,
        s.zone,
        s.camera,
        s.confidence,
        s.review,
        s.source,
      ]),
    ]);
    notify("Filtered sightings exported as CSV.");
  }
  return (
    <>
      <Heading
        title="Sightings"
        description={
          role === "admin"
            ? "Search, filter and review all wildlife detections"
            : "Search and review wildlife detections in your assigned zones (GE-1, GE-2)"
        }
      >
        <button onClick={exportRows}>
          <Download size={17} />
          Export
        </button>
      </Heading>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search sightings"
            placeholder="Search species, zone or camera…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <SpeciesSelect value={species} onChange={setSpecies} />
        <ZoneSelect value={zone} onChange={setZone} />
        <select
          aria-label="Filter by source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">All Sources</option>
          <option>Camera trap</option>
          <option>Ranger report</option>
          <option>CSV upload</option>
        </select>
        {role === "admin" && (
          <select
            aria-label="Filter by review status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All Review Status</option>
            {[
              "Needs review",
              "Approved",
              "Rejected",
              "Automatically saved",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <div className="date-range">
          <input
            aria-label="Sightings start date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>–</span>
          <input
            aria-label="Sightings end date"
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <button
        className="text-button clear-filters"
        onClick={() => {
          setQ("");
          setSpecies("all");
          setZone("all");
          setSource("all");
          setStatus("all");
          setFrom("2026-09-22");
          setTo(TODAY);
        }}
      >
        Clear filters
      </button>
      <div className="sightings-grid">
        <Card className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-label="Selection" />
                  <th>Species</th>
                  <th>Date & Time</th>
                  <th>Zone</th>
                  <th>Source</th>
                  <th>{role === "admin" ? "Review Status" : "Confidence"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * 10, page * 10).map((s) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    aria-selected={selected?.id === s.id}
                    className={selected?.id === s.id ? "row-selected" : ""}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelectedId(s.id);
                    }}
                  >
                    <td>
                      <input
                        type="radio"
                        aria-label={`Select sighting ${s.id}`}
                        checked={selected?.id === s.id}
                        onChange={() => setSelectedId(s.id)}
                      />
                    </td>
                    <td>
                      <span className="species-cell">
                        <Animal species={s.species} size={20} />
                        {s.species}
                      </span>
                    </td>
                    <td>
                      {shortDate(s.date)}, {s.time}
                    </td>
                    <td>{s.zone}</td>
                    <td>{s.camera}</td>
                    <td>
                      {role === "admin" ? (
                        <Badge
                          tone={
                            s.review === "Needs review"
                              ? "yellow"
                              : s.review === "Rejected"
                                ? "red"
                                : "green"
                          }
                        >
                          {s.review}
                        </Badge>
                      ) : s.source === "Ranger report" ? (
                        "—"
                      ) : (
                        s.confidence.toFixed(2)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <Empty />}
          </div>
          <Pagination
            total={filtered.length}
            page={Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)))}
            onPage={setPage}
          />
        </Card>
        {selected && (
          <Details sighting={selected}>
            {role === "admin" ? (
              <>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => changeReview("Approved")}
                  >
                    <Check size={16} />
                    Approve (Correct)
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => changeReview("Rejected")}
                  >
                    <X size={16} />
                    Reject (Incorrect)
                  </button>
                </div>
                <label className="field-label">
                  Audit Note (optional)
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note about this detection…"
                    rows={2}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setData((d) => ({
                      ...d,
                      sightings: d.sightings.map((s) =>
                        s.id === selected.id ? { ...s, note } : s,
                      ),
                    }));
                    notify("Audit note saved.");
                  }}
                >
                  Save note
                </button>
              </>
            ) : (
              <div className="button-row">
                <button
                  className="warning-button"
                  onClick={() =>
                    dialog({
                      title: "Flag a possible issue",
                      fields: [
                        {
                          name: "reason",
                          label: "What looks incorrect?",
                          type: "textarea",
                        },
                      ],
                      submit: "Submit flag",
                      onSave: (v) => {
                        setData((d) => ({
                          ...d,
                          sightings: d.sightings.map((s) =>
                            s.id === selected.id
                              ? {
                                  ...s,
                                  flagged: true,
                                  review: "Needs review",
                                  note: v.reason,
                                }
                              : s,
                          ),
                        }));
                        notify("Issue flagged for admin review.");
                      },
                    })
                  }
                >
                  <Flag size={17} />
                  Flag issue
                </button>
                <button className="blue-button" onClick={fieldReport}>
                  <MapPin size={17} />
                  Report field sighting
                </button>
              </div>
            )}
          </Details>
        )}
      </div>
      {role === "ranger" && !selected && (
        <button className="blue-button" onClick={fieldReport}>
          <Plus size={17} />
          Report field sighting
        </button>
      )}
    </>
  );
}

export function WildlifeMap() {
  const { role, data, selectedId, setSelectedId, go } = useApp();
  const sightings = useVisibleSightings();
  const [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [camera, setCamera] = useState("all"),
    [date, setDate] = useState(TODAY),
    [closed, setClosed] = useState(false);
  const filtered = sightings.filter(
    (s) =>
      (species === "all" || s.species === species) &&
      (zone === "all" || s.zone === zone) &&
      (camera === "all" || s.camera === camera) &&
      s.date === date,
  );
  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];
  const selectedLocation = selected ? sightingLocation(selected, data.cameras) : null;
  return (
    <>
      <Heading
        title="Wildlife Map"
        description={
          role === "admin"
            ? "Explore sightings, camera locations and managed zones around Gelephu"
            : "Explore sightings around your assigned zones with camera locations and managed zones"
        }
      />
      <div className="filter-bar">
        <input
          aria-label="Map date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <SpeciesSelect value={species} onChange={setSpecies} />
        <ZoneSelect value={zone} onChange={setZone} />
        <select
          aria-label="Filter map by camera"
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
        >
          <option value="all">All Cameras</option>
          {[...new Set(sightings.map((s) => s.camera))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          className="text-button"
          onClick={() => {
            setSpecies("all");
            setZone("all");
            setCamera("all");
            setDate(TODAY);
            setClosed(false);
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="map-detail-grid">
        <MapPanel
          mode="wildlife"
          activeZone={zone}
          sightings={filtered}
          cameras={data.cameras.filter(c => (zone === "all" || c.zone === zone) && (camera === "all" || c.id === camera))}
          selectedSightingId={selected?.id}
          filterLabel={`${filtered.length} matching sightings`}
          onSightingSelect={(id) => {
            setSelectedId(id);
            setClosed(false);
          }}
          onSelect={(z) => {
            setZone(z);
            setSelectedId(
              sightings.find((s) => s.zone === z && s.date === date)?.id ?? "",
            );
            setClosed(false);
          }}
        />
        {!closed && selected ? (
          <Card
            title="Selected Sighting"
            action={
              <button
                className="icon-button"
                aria-label="Close selected sighting"
                onClick={() => setClosed(true)}
              >
                <X size={20} />
              </button>
            }
          >
            <WildlifeImage sighting={selected} />
            <h2 className="animal-title">
              <Animal />
              {selected.species}
            </h2>
            <p className="muted scientific">
              {selected.species === "Asian Elephant" ? "Elephas maximus" : ""}
            </p>
            <dl className="details">
              <dt>Date & Time</dt>
              <dd>
                {shortDate(selected.date)}, {selected.time}
              </dd>
              <dt>Location</dt>
              <dd>
                {selectedLocation && formatCoordinates(selectedLocation.coordinates)}
                <br />
                <small className="muted">{selectedLocation && locationLabel(selectedLocation.source)}</small>
              </dd>
              <dt>Zone</dt>
              <dd>
                {selected.zone} — {ZONES[selected.zone]}
              </dd>
              <dt>Source</dt>
              <dd>{selected.camera}</dd>
              <dt>Confidence</dt>
              <dd>{selected.confidence.toFixed(2)} (model score)</dd>
              {role === "admin" && (
                <>
                  <dt>Review Status</dt>
                  <dd>
                    <Badge tone="yellow">{selected.review}</Badge>
                  </dd>
                </>
              )}
            </dl>
            <button
              className="full-width"
              onClick={() => {
                setSelectedId(selected.id);
                go("sightings");
              }}
            >
              View in Sightings <ExternalLink size={16} />
            </button>
          </Card>
        ) : (
          <Card title={closed ? "Explore the map" : "No matching sightings"}>
            <p className="muted">
              {closed
                ? "Select a monitoring zone on the map to view its sightings."
                : "Change the species, date, zone or camera filters to see a matching record."}
            </p>
          </Card>
        )}
      </div>
      <p className="map-caption">
        Real OpenStreetMap geography around Gelephu. Sightings without GPS use
        sample or camera positions. GE sector circles are illustrative, not official boundaries.
      </p>
    </>
  );
}

export function Predictions() {
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

export function Alerts() {
  const { role, data, setData, dialog, notify } = useApp();
  const [tab, setTab] = useState<AlertRecord["status"]>("New"),
    [severity, setSeverity] = useState("all"),
    [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [id, setId] = useState("A-001");
  const ranger = role === "ranger";
  const visible = data.alerts.filter(
    (a) => !ranger || ["GE-1", "GE-2"].includes(a.zone),
  );
  const filtered = visible.filter(
    (a) =>
      a.status === tab &&
      (severity === "all" || a.severity === severity) &&
      (species === "all" || a.species === species) &&
      (zone === "all" || a.zone === zone),
  );
  const selected = filtered.find((a) => a.id === id) ?? filtered[0];
  function update(changes: Partial<AlertRecord>, event: string) {
    if (!selected) return;
    setData((d) => ({
      ...d,
      alerts: d.alerts.map((a) =>
        a.id === selected.id
          ? { ...a, ...changes, timeline: [...a.timeline, event] }
          : a,
      ),
    }));
    notify(event + " — saved locally.");
    if (changes.status) setTab(changes.status);
  }
  return (
    <>
      <Heading
        title="Alerts"
        description={
          ranger
            ? "View and respond to wildlife alerts in your assigned zones (GE-1, GE-2)"
            : "Monitor and manage wildlife alerts from AI detections, ranger reports and system triggers."
        }
      />
      <div className="tabs">
        {(["New", "Acknowledged", "Resolved"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "New" && ranger ? "Active Alerts" : t} (
            {visible.filter((a) => a.status === t).length})
          </button>
        ))}
      </div>
      <div className={ranger ? "ranger-alert-grid" : "alerts-grid"}>
        <Card className="alert-list-card">
          {!ranger && (
            <div className="filter-bar compact">
              <select
                aria-label="Filter alert severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="all">All severities</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <SpeciesSelect value={species} onChange={setSpecies} />
              <ZoneSelect value={zone} onChange={setZone} />
            </div>
          )}
          {ranger ? (
            <div className="alert-list">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  className={selected?.id === a.id ? "selected" : ""}
                  onClick={() => setId(a.id)}
                >
                  <Animal species={a.species} size={32} />
                  <span>
                    <b>
                      {a.species.includes("Elephant")
                        ? "Elephant near settlement"
                        : a.species + " detected"}
                    </b>
                    <small>
                      {a.zone} — {ZONES[a.zone]}
                    </small>
                    <small>
                      {DATE_LABEL}, {a.time}
                    </small>
                    <Severity value={a.severity} />
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Severity</th>
                    <th>Species</th>
                    <th>Zone</th>
                    <th>Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr
                      key={a.id}
                      tabIndex={0}
                      onClick={() => setId(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setId(a.id);
                      }}
                      className={selected?.id === a.id ? "alert-row-selected" : ""}
                    >
                      <td>
                        {DATE_LABEL}
                        <br />
                        {a.time}
                      </td>
                      <td>
                        <Severity value={a.severity} />
                      </td>
                      <td>{a.species}</td>
                      <td>
                        {a.zone}
                        <br />
                        {ZONES[a.zone]}
                      </td>
                      <td>{a.trigger}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!filtered.length && <Empty text="No alerts in this queue." />}
        </Card>
        {selected && (
          <Card
            title={
              selected.species.includes("Elephant")
                ? "Elephant near settlement"
                : selected.species + " detected"
            }
            action={
              <Severity value={selected.severity} />
            }
          >
            <p className="meta">
              <MapPin size={14} />
              {selected.zone} — {ZONES[selected.zone]} &nbsp; {DATE_LABEL},{" "}
              {selected.time}
            </p>
            <div className={ranger ? "alert-evidence" : "stack"}>
              <WildlifeImage
                sighting={data.sightings.find(
                  (s) => s.species === selected.species,
                )}
              />
              <dl className="details">
                <dt>Species</dt>
                <dd>{selected.species}</dd>
                <dt>Severity</dt>
                <dd>
                  <Severity value={selected.severity} />
                </dd>
                <dt>Location</dt>
                <dd>{selected.zone} — {ZONES[selected.zone]}<br /><small className="muted">Alert GPS not supplied</small></dd>
                <dt>Confidence</dt>
                <dd>0.92 (model score)</dd>
                <dt>Rule rationale</dt>
                <dd>{selected.trigger}</dd>
                <dt>Assigned ranger</dt>
                <dd>
                  <User size={14} /> {selected.ranger}
                </dd>
              </dl>
            </div>
            <h2 className="section-label">Alert response timeline</h2>
            <ol className="timeline">
              {selected.timeline.map((t, i) => (
                <li className="done" key={i}>
                  <span>
                    {i === 0
                      ? `${DATE_LABEL}, ${selected.time}`
                      : "Demo action"}
                  </span>
                  <div>{t}</div>
                </li>
              ))}
              {selected.status === "New" && (
                <li>
                  <span>Pending</span>
                  <div>Alert acknowledged</div>
                </li>
              )}
              {!selected.response && selected.status !== "Resolved" && (
                <li>
                  <span>Pending</span>
                  <div>Ranger response recorded</div>
                </li>
              )}
              {selected.status !== "Resolved" && (
                <li>
                  <span>Pending</span>
                  <div>Alert resolved</div>
                </li>
              )}
            </ol>
            {selected.response && (
              <p className="response-note">
                <b>Response:</b> {selected.response}
              </p>
            )}
            <div className="button-row wrap">
              {selected.status === "New" && (
                <button
                  className={ranger ? "blue-button" : "primary"}
                  onClick={() =>
                    update({ status: "Acknowledged" }, "Alert acknowledged")
                  }
                >
                  <Check size={17} />
                  Acknowledge
                </button>
              )}
              {!ranger && (
                <button
                  onClick={() =>
                    dialog({
                      title: "Assign ranger",
                      fields: [
                        {
                          name: "ranger",
                          label: "Ranger",
                          type: "select",
                          value: selected.ranger,
                          options: [
                            "Tashi Dorji",
                            ...data.rangers
                              .filter((r) => r.status === "Active")
                              .map((r) => r.name),
                          ],
                        },
                      ],
                      onSave: (v) =>
                        update({ ranger: v.ranger }, `Assigned to ${v.ranger}`),
                    })
                  }
                >
                  Assign / Reassign
                </button>
              )}
              {selected.status !== "Resolved" && (
                <>
                  <button
                    disabled={selected.status === "New"}
                    onClick={() =>
                      dialog({
                        title: "Record response",
                        fields: [
                          {
                            name: "response",
                            label: "Action taken",
                            type: "textarea",
                            value: selected.response,
                          },
                        ],
                        submit: "Save response",
                        onSave: (v) =>
                          update(
                            { response: v.response },
                            "Ranger response recorded",
                          ),
                      })
                    }
                  >
                    <FileText size={16} />
                    Record response
                  </button>
                  <button
                    className="primary"
                    disabled={!selected.response}
                    onClick={() =>
                      update({ status: "Resolved" }, "Alert resolved")
                    }
                  >
                    <Check size={17} />
                    Resolve
                  </button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export function Cameras() {
  const { role, data, setData, dialog, notify } = useApp();
  const [q, setQ] = useState(""),
    [zone, setZone] = useState("all"),
    [status, setStatus] = useState("all"),
    [id, setId] = useState("CAM-012"),
    [page, setPage] = useState(1);
  const ranger = role === "ranger";
  const filtered = data.cameras.filter(
    (c) =>
      (!ranger || ["GE-1", "GE-2"].includes(c.zone)) &&
      (zone === "all" || c.zone === zone) &&
      (status === "all" || c.status === status) &&
      `${c.id} ${ZONES[c.zone]}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selected = filtered.find((c) => c.id === id) ?? filtered[0];
  useEffect(() => setPage(1), [q, zone, status]);
  function edit(camera?: CameraRecord) {
    const location = camera ? cameraLocation(camera) : { coordinates: GELEPHU_CENTER, source: "demo" as const };
    dialog({
      title: camera ? "Edit camera" : "Register new camera",
      description:
        "This registers a demonstration observation source. It does not establish a live camera connection.",
      fields: [
        {
          name: "id",
          label: "Camera ID",
          value:
            camera?.id ??
            `CAM-${String(data.cameras.length + 100).padStart(3, "0")}`,
        },
        {
          name: "zone",
          label: "Zone",
          type: "select",
          value: camera?.zone,
          options: Object.keys(ZONES),
        },
        {
          name: "lat",
          label: "Latitude",
          type: "number",
          value: String(location.coordinates[0]),
          min: -90,
          max: 90,
          step: "any",
        },
        {
          name: "lng",
          label: "Longitude",
          type: "number",
          value: String(location.coordinates[1]),
          min: -180,
          max: 180,
          step: "any",
        },
        {
          name: "status",
          label: "Demo reporting status",
          type: "select",
          value: camera?.status ?? "Offline",
          options: ["Online", "Offline"],
        },
      ],
      submit: camera ? "Save camera" : "Register camera",
      onSave: (v) => {
        if (data.cameras.some((c) => c.id === v.id && c.id !== camera?.id)) {
          notify("This camera ID already exists. Choose a different ID.");
          return;
        }
        const record: CameraRecord = {
          id: v.id,
          zone: v.zone as Zone,
          lat: v.lat,
          lng: v.lng,
          locationSource: Number(v.lat) === location.coordinates[0] && Number(v.lng) === location.coordinates[1]
            ? location.source === "demo" ? "demo" : "recorded"
            : "recorded",
          status: v.status as CameraRecord["status"],
          time: camera?.time ?? "00:00",
          source: "Recorded (demo)",
        };
        setData((d) => ({
          ...d,
          cameras: camera
            ? d.cameras.map((c) => (c.id === camera.id ? record : c))
            : [record, ...d.cameras],
        }));
        setId(record.id);
        notify("Camera details saved.");
      },
    });
  }
  return (
    <>
      <Heading
        title="Cameras"
        description={
          ranger
            ? "View camera locations and latest images in your assigned zones (GE-1, GE-2)"
            : "Manage camera devices, view status and recent images."
        }
      >
        {!ranger && (
          <>
            <button className="primary" onClick={() => edit()}>
              <Plus size={18} />
              Register New Camera
            </button>
            <button disabled={!selected} onClick={() => edit(selected)}>
              <Edit size={17} />
              Edit Camera
            </button>
          </>
        )}
      </Heading>
      <div className="cameras-grid">
        <Card className="table-card">
          <div className="filter-bar">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search cameras"
                placeholder="Search by ID or location…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <ZoneSelect value={zone} onChange={setZone} />
            <select
              aria-label="Filter camera status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option>Online</option>
              <option>Offline</option>
            </select>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Camera ID</th>
                  <th>Zone</th>
                  {!ranger && <th>Location</th>}
                  <th>Last received</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * 8, page * 8).map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => setId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setId(c.id);
                    }}
                    className={selected?.id === c.id ? "row-warning" : ""}
                  >
                    <td>
                      <b>{c.id}</b>
                    </td>
                    <td>{c.zone}</td>
                    {!ranger && <td>{ZONES[c.zone]}</td>}
                    <td>
                      {DATE_LABEL}
                      <br />
                      {c.time}
                    </td>
                    <td>
                      <Status status={c.status} />
                    </td>
                    <td>{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <Empty />}
          </div>
          <Pagination
            page={page}
            total={filtered.length}
            size={8}
            onPage={setPage}
          />
        </Card>
        <div className="stack">
          <MapPanel
            mode="cameras"
            cameras={filtered}
            sightings={[]}
            selectedCameraId={selected?.id}
            onCameraSelect={setId}
            filterLabel={`${filtered.length} matching cameras`}
            onSelect={(z) => {
              setZone(z);
              setId(data.cameras.find((c) => c.zone === z)?.id ?? "");
            }}
          />
          {selected && (
            <Card
              title={ranger ? "Latest Recorded Image" : `Camera ${selected.id}`}
              action={<Badge tone="blue">Recorded data (demo)</Badge>}
            >
              <WildlifeImage
                sighting={{
                  ...data.sightings[0],
                  camera: selected.id,
                  time: selected.time,
                  zone: selected.zone,
                }}
              />
              <div className="info-box">
                <Info size={18} />
                <div>
                  <b>Recorded demo image</b>
                  <br />
                  Live feed planned for a future phase.
                </div>
              </div>
              <dl className="details">
                <dt>Camera ID</dt>
                <dd>{selected.id}</dd>
                <dt>Zone</dt>
                <dd>
                  {selected.zone} — {ZONES[selected.zone]}
                </dd>
                <dt>Last received</dt>
                <dd>
                  {DATE_LABEL}, {selected.time}
                </dd>
                <dt>Source</dt>
                <dd>{selected.source}</dd>
                <dt>Demo status</dt>
                <dd>
                  <Status status={selected.status} />
                </dd>
                <dt>Location</dt>
                <dd>
                  {formatCoordinates(cameraLocation(selected).coordinates)}
                  <br />
                  <small className="muted">{locationLabel(cameraLocation(selected).source)}</small>
                </dd>
                <dt>Elevation</dt>
                <dd>428 m</dd>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
