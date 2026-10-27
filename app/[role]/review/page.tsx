"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Info, Upload } from "lucide-react";
import {
  csvDownload,
  DATE_LABEL,
  SPECIES,
  TODAY,
  ZONES,
  ZONE_IDS,
  type Sighting,
  type Zone,
} from "@/lib/data";
import { useApp } from "@/components/context";
import { Badge, Card, Heading, Status, WildlifeImage } from "@/components/ui";
import { SpeciesSelect } from "@/components/filters";

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

export default function DataReview() {
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
        // The zone column accepts a gewog name or its code.
        const zoneId = ZONE_IDS.find(
          (z) => z === o.zone || ZONES[z].toLowerCase() === o.zone.toLowerCase(),
        );
        if (
          !SPECIES.includes(o.species) ||
          !zoneId ||
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
          zone: zoneId as Zone,
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
            <code>species,date,time,zone,camera,confidence</code>, where{" "}
            <code>zone</code> is a gewog name (for example Gelephu) or code. Imported
            records save automatically in Sightings.
          </p>
          <div className="button-row">
            <button
              onClick={() =>
                csvDownload("rikhanet-import-example.csv", [
                  ["species", "date", "time", "zone", "camera", "confidence"],
                  ["Asian Elephant", TODAY, "06:24", "Chhuzangang", "CAM-012", 0.92],
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
