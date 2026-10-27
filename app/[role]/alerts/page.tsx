"use client";
import { useState } from "react";
import { Check, ChevronRight, FileText, MapPin, User } from "lucide-react";
import { DATE_LABEL, ZONES, type AlertRecord } from "@/lib/data";
import { useApp, useAssignedZones } from "@/components/context";
import {
  Animal,
  Card,
  Empty,
  Heading,
  Severity,
  WildlifeImage,
} from "@/components/ui";
import { SpeciesSelect, ZoneSelect } from "@/components/filters";

export default function Alerts() {
  const { role, data, setData, dialog, notify } = useApp();
  const [tab, setTab] = useState<AlertRecord["status"]>("New"),
    [severity, setSeverity] = useState("all"),
    [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [id, setId] = useState("A-001");
  const ranger = role === "ranger";
  const zones = useAssignedZones();
  const visible = data.alerts.filter((a) => zones.includes(a.zone));
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
            ? "View and respond to wildlife alerts in your assigned gewogs"
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
                      {ZONES[a.zone]}
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
              {ZONES[selected.zone]} &nbsp; {DATE_LABEL},{" "}
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
                <dd>{ZONES[selected.zone]}<br /><small className="muted">Alert GPS not supplied</small></dd>
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
