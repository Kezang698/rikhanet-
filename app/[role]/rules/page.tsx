"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type Rule } from "@/lib/data";
import { useApp } from "@/components/context";
import { Card, Heading, MapPanel, Toggle } from "@/components/ui";

export default function Rules() {
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
