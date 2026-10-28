"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Download, Flag, MapPin, Plus, Search, X } from "lucide-react";
import {
  csvDownload,
  shortDate,
  SPECIES,
  TODAY,
  ZONES,
  type Sighting,
  type Zone,
} from "@/lib/data";
import { useApp, useAssignedZones } from "@/components/context";
import { ReviewActions } from "@/components/DatabaseWorkflows";
import {
  Animal,
  Badge,
  Card,
  Details,
  Empty,
  Heading,
  Pagination,
} from "@/components/ui";
import {
  SpeciesSelect,
  ZoneSelect,
  useVisibleSightings,
} from "@/components/filters";

export default function Sightings() {
  const { role, data, setData, selectedId, setSelectedId, notify, dialog, backend, enrichSighting, go } =
    useApp();
  const database = backend.mode === "api";
  const [enriching, setEnriching] = useState(false);
  const visible = useVisibleSightings();
  const zones = useAssignedZones();
  const [q, setQ] = useState(""),
    [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [source, setSource] = useState("all"),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(database ? "" : "2026-09-22"),
    [to, setTo] = useState(""),
    [note, setNote] = useState("");
  const filtered = visible.filter(
    (s) =>
      (species === "all" || s.species === species) &&
      (zone === "all" || s.zone === zone) &&
      (source === "all" || s.source === source) &&
      (status === "all" || s.review === status) &&
      (!from || s.date >= from) &&
      (!to || s.date <= to) &&
      `${s.species} ${s.camera} ${ZONES[s.zone]}`
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
    if (database) {
      go("reports");
      return;
    }
    if (!zones.length) {
      notify("No gewog is assigned to you yet. Ask an admin to assign one.");
      return;
    }
    dialog({
      title: "Report field sighting",
      description:
        "Add a demonstration observation to one of your assigned gewogs. This form stores data in this browser.",
      fields: [
        { name: "species", label: "Species", type: "select", options: SPECIES },
        {
          name: "zone",
          label: "Gewog",
          type: "select",
          options: zones.map((z) => ({ value: z, label: ZONES[z] })),
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
        "Gewog",
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
        ZONES[s.zone],
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
            : "Search and review wildlife detections in your assigned gewogs"
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
            placeholder="Search species, gewog or camera…"
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
          {database && <option>Stored observation</option>}
          <option>Camera trap</option>
          <option>Ranger report</option>
          <option>CSV upload</option>
          <option>Local YOLO inference</option>
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
          setTo("");
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
                  <th>Gewog</th>
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
                    <td>{ZONES[s.zone]}</td>
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
                          {s.detectionPending ? "Awaiting detection" : s.review}
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
            {database ? (
              <>
                <Link className="primary prediction-link" href={`/${role}/predictions?detection=${selected.id}`}>View image prediction on map</Link>
                <p>{selected.detectionPending ? "Waiting for the external detector to supply species and confidence." : selected.enriched ? "Detection and weather are stored in PostgreSQL." : "Detection saved. Weather enrichment is pending."}</p>
                <button disabled={enriching || selected.detectionPending} onClick={async () => {
                  setEnriching(true);
                  try {
                    const result = await enrichSighting(selected.id);
                    notify(result.skipped ? "Discarded sighting skipped." : result.prediction_status === "unavailable" ? "Weather saved. TFT predictions await integration and validation." : "Sighting enriched.");
                  } catch (error) { notify(error instanceof Error ? error.message : "Enrichment failed"); }
                  finally { setEnriching(false); }
                }}>{enriching ? "Enriching…" : selected.enriched ? "Check predictions" : "Enrich sighting"}</button>
                <ReviewActions key={selected.id} id={selected.id} note={selected.note}/>
                <button onClick={fieldReport}>Create a field report</button>
              </>
            ) : role === "admin" ? (
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
