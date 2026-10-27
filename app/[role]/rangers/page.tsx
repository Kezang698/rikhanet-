"use client";
import { useState } from "react";
import { Edit, Plus, Search } from "lucide-react";
import { isZone, ZONE_IDS, ZONES, type RangerRecord, type Zone } from "@/lib/data";
import { useApp } from "@/components/context";
import { Badge, Card, Empty, Heading, Status } from "@/components/ui";
import { ZoneSelect } from "@/components/filters";

export default function Rangers() {
  const { data, setData, dialog, notify } = useApp();
  const [q, setQ] = useState(""),
    [zone, setZone] = useState("all"),
    [status, setStatus] = useState("all"),
    [id, setId] = useState("RNG-001");
  const filtered = data.rangers.filter(
    (r) =>
      (zone === "all" || r.zones.includes(zone as Zone)) &&
      (status === "all" || r.status === status) &&
      `${r.name} ${r.id} ${r.zones.map((z) => ZONES[z]).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
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
          label: "Assigned gewogs (the ranger sees only these)",
          type: "checkboxes",
          value: r?.zones.join(",") ?? "",
          options: ZONE_IDS.map((z) => ({ value: z, label: ZONES[z] })),
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
        const zones = v.zones.split(",").filter(isZone) as Zone[];
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
          // Keep the demo ranger login linked if its staff ID is edited.
          currentRangerId:
            r && r.id === d.currentRangerId ? record.id : d.currentRangerId,
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
        description="Manage field staff, contact details and gewog assignments. Rangers see only the gewogs assigned here."
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
            placeholder="Search by name, staff ID or gewog…"
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
                  <th>Assigned Gewogs</th>
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
                    <td>{r.zones.length ? r.zones.map((z) => ZONES[z]).join(", ") : "None"}</td>
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
              <dt>Assigned Gewogs</dt>
              <dd className="zone-tags">
                {selected.zones.length
                  ? selected.zones.map((z) => (
                      <span key={z}>
                        <b>{ZONES[z]}</b>
                      </span>
                    ))
                  : "None assigned"}
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
