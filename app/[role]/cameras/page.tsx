"use client";
import { useEffect, useState } from "react";
import { Edit, Info, Plus, Search } from "lucide-react";
import { DATE_LABEL, ZONES, ZONE_IDS, type CameraRecord, type Zone } from "@/lib/data";
import { useApp, useAssignedZones } from "@/components/context";
import {
  cameraLocation,
  formatCoordinates,
  GEWOG_BY_ID,
  locationLabel,
} from "@/lib/maps";
import {
  Badge,
  Card,
  Empty,
  Heading,
  MapPanel,
  Pagination,
  Status,
  WildlifeImage,
} from "@/components/ui";
import { ZoneSelect } from "@/components/filters";

export default function Cameras() {
  const { role, data, setData, dialog, notify } = useApp();
  const [q, setQ] = useState(""),
    [zone, setZone] = useState("all"),
    [status, setStatus] = useState("all"),
    [id, setId] = useState("CAM-012"),
    [page, setPage] = useState(1);
  const ranger = role === "ranger";
  const zones = useAssignedZones();
  const filtered = data.cameras.filter(
    (c) =>
      zones.includes(c.zone) &&
      (zone === "all" || c.zone === zone) &&
      (status === "all" || c.status === status) &&
      `${c.id} ${ZONES[c.zone]}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selected = filtered.find((c) => c.id === id) ?? filtered[0];
  useEffect(() => setPage(1), [q, zone, status]);
  function edit(camera?: CameraRecord) {
    const location = camera ? cameraLocation(camera) : { coordinates: GEWOG_BY_ID[ZONE_IDS[0]].label, source: "demo" as const };
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
          label: "Gewog",
          type: "select",
          value: camera?.zone,
          options: ZONE_IDS.map((z) => ({ value: z, label: ZONES[z] })),
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
            ? "View camera locations and latest images in your assigned gewogs"
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
                  <th>Gewog</th>
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
                    <td>{ZONES[c.zone]}</td>
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
                <dt>Gewog</dt>
                <dd>{ZONES[selected.zone]}</dd>
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
