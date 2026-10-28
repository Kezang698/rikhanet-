"use client";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { apiRequest, type CsvImportResult } from "@/lib/api";
import { useApp } from "./context";
import { Card } from "./ui";

export function DatabaseIntake() {
  const { refreshBackend, notify, go } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  async function validate() {
    setBusy(true); setError(""); setPreview(null); setResult(null);
    try {
      const response = await apiRequest<CsvImportResult>("imports/sightings?dry_run=true", {
        method: "POST", headers: { "Content-Type": "text/csv; charset=utf-8" }, body: text });
      setPreview(response);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV validation failed"); }
    finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError("");
    try {
      const response = await apiRequest<CsvImportResult>("imports/sightings", {
        method: "POST", headers: { "Content-Type": "text/csv; charset=utf-8" }, body: text });
      setResult(response); setPreview(null);
      await refreshBackend();
      notify(`${response.imported} sightings imported; ${response.skipped} already stored.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV import failed"); }
    finally { setBusy(false); }
  }
  return <>
    <Card title="Import sightings from CSV" className="csv-import">
      <p>Import up to 1,000 observations per file (2 MB). Dates and times use Bhutan time. Each row needs GPS coordinates inside its stated gewog.</p>
      <div className="button-row">
        <button disabled={busy} onClick={() => input.current?.click()}><Upload size={17} />Choose CSV</button>
        <a className="text-button" href="/database-sightings-template.csv" download><Download size={17} />Download template</a>
      </div>
      <input hidden ref={input} type="file" accept=".csv,text/csv" onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setPreview(null); setResult(null); setError("");
        if (file.size > 2_000_000) { setError("Choose a CSV up to 2 MB."); return; }
        try { setText(await file.text()); setFileName(file.name); }
        catch { setError("Could not read this file."); }
      }} />
      <label className="field-label">CSV contents{fileName ? ` — ${fileName}` : ""}
        <textarea aria-label="CSV contents" value={text} disabled={busy} onChange={(event) => {
          setText(event.target.value); setPreview(null); setResult(null); setError(""); setFileName("");
        }} placeholder="Paste a CSV here, or choose a file." />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={busy || !text.trim()} onClick={() => void validate()}>{busy ? "Processing…" : "Validate CSV"}</button>
      {preview && <div className="csv-preview">
        <p role="status">{preview.validated} valid rows: {preview.new_rows} new, {preview.skipped} already stored. Nothing has been saved yet.</p>
        <table><thead><tr><th>Species</th><th>Timestamp (Bhutan)</th><th>Gewog</th><th>Camera</th><th>Confidence</th></tr></thead>
          <tbody>{preview.preview.map((row) => <tr key={row.detection_id}>
            <td>{row.species}</td><td>{new Date(row.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Thimphu" })}</td>
            <td>{row.gewog_name}</td><td>{row.camera_id}</td><td>{row.confidence}</td>
          </tr>)}</tbody></table>
        <small>First {preview.preview.length} rows shown. All rows are rechecked when importing.</small>
        <div className="button-row"><button className="primary" disabled={busy} onClick={() => void commit()}>Import {preview.new_rows} new sightings</button></div>
      </div>}
      {result && <p role="status">Import complete: {result.imported} new sightings and {result.skipped} existing rows skipped.</p>}
      <p className="muted small">Optional detection_id accepts UUIDs from another system. Re-uploading an identical file is safe. Weather and predictions are separate from import; historical records are not enriched with today’s weather.</p>
    </Card>
    <Card title="Camera images">
      <p>Open Webcam to run the existing detector on an uploaded image or live frame. Accepted elephant detections save their original image with the sighting.</p>
      <div className="button-row"><button onClick={() => go("webcam")}>Open Webcam</button><button onClick={() => go("sightings")}>View stored sightings</button></div>
    </Card>
  </>;
}
