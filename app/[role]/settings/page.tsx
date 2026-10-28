"use client";
import {
  Bell,
  Database,
  FileText,
  Link,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { seedState } from "@/lib/data";
import { useApp } from "@/components/context";
import { Badge, Card, Heading } from "@/components/ui";
import { DatabaseSettings } from "@/components/DatabaseWorkflows";

export default function SettingsPage() {
  const {backend}=useApp();
  return backend.mode==="api"?<DatabaseSettings/>:<DemoSettings/>;
}
function DemoSettings() {
  const { data, setData, dialog, notify, go, backend } = useApp();
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
                "Test notification: Elephant detected in Chhuzangang gewog (demonstration only).",
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
          <p>{backend.mode === "api" ? "Sightings and prediction results use the PostgreSQL API." : "Connection to camera network and data storage."}</p>
          <dl className="details">
            <dt>Camera network</dt>
            <dd>Planned (12/12 cameras)</dd>
            <dt>Storage</dt>
            <dd>Planned</dd>
            <dt>Database</dt>
            <dd>{backend.mode === "api" ? backend.status === "connected" ? "PostgreSQL connected" : "Waiting for API connection" : "Planned"}</dd>
          </dl>
          <button
            onClick={() =>
              dialog({
                title: "Connection settings",
                description:
                  backend.mode === "api" ? "The local API stores sightings in PostgreSQL and reads prediction results. TFT inference, authentication and ranger alert delivery need further integration. Camera setup and account preferences are stored in this browser." : "This mode uses browser demonstration data. Switch NEXT_PUBLIC_DATA_MODE to api and restart Next.js to connect PostgreSQL.",
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
        disabled={backend.mode === "api"}
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
