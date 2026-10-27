"use client";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  FileText,
  MapPin,
} from "lucide-react";
import { shortDate, ZONES } from "@/lib/data";
import { useApp } from "@/components/context";
import { Animal, Card, Heading, MapPanel } from "@/components/ui";
import { useVisibleSightings } from "@/components/filters";

export default function Overview() {
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
