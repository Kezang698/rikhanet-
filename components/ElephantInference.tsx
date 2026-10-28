"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, LoaderCircle, Play, ScanLine, Square, Video } from "lucide-react";
import { useApp, useAssignedZones } from "@/components/context";
import { Card } from "@/components/ui";
import { ZONE_IDS, ZONES, type Sighting, type Zone } from "@/lib/data";

interface Prediction {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
  trackId?: number | null;
}
interface InferenceResult {
  predictions?: Prediction[];
  annotatedImageUrl?: string | null;
  count?: number;
  averageConfidence?: number | null;
  highestConfidence?: number | null;
  lowestConfidence?: number | null;
  summary?: string;
  error?: string;
}

export function ElephantInference() {
  const { data, setData, notify } = useApp();
  const allowedZones = useAssignedZones();
  const cameras = data.cameras.filter((camera) => allowedZones.includes(camera.zone));
  const [cameraId, setCameraId] = useState(cameras[0]?.id ?? "Webcam");
  const [zone, setZone] = useState<Zone>(cameras[0]?.zone ?? allowedZones[0] ?? ZONE_IDS[0]);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [metrics, setMetrics] = useState<{ count: number; average: number | null } | null>(null);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef("");
  const hadElephantRef = useRef(false);
  const savedTrackIdsRef = useRef(new Set<number>());

  const saveDetectedElephants = useCallback((found: Prediction[]) => {
    const elephants = found.filter((prediction) => /elephant/i.test(prediction.class));
    if (!elephants.length) return;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const records: Sighting[] = elephants.map((prediction, index) => ({
      id: `HF-${now.getTime()}-${index + 1}`,
      species: "Asian Elephant",
      date,
      time,
      zone,
      camera: cameraId,
      confidence: Math.max(0, Math.min(1, prediction.confidence)),
      review: "Needs review",
      source: "Local YOLO inference",
      note: `Detected as ${prediction.class} by the local best.pt model. Review before operational use.`,
    }));
    setData((current) => ({ ...current, sightings: [...records, ...current.sightings] }));
    notify(`${elephants.length} elephant detection${elephants.length === 1 ? "" : "s"} saved to Sightings for review.`);
  }, [cameraId, notify, setData, zone]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (imageUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current);
  }, []);

  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => setError("The webcam preview could not start."));
    }
  }, [streaming]);

  useEffect(() => {
    if (!streaming) {
      setLiveStatus("");
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastSentAt = 0;
    let animationFrame = 0;
    let controller: AbortController | null = null;
    const canvas = document.createElement("canvas");
    setLiveStatus("Starting local model…");

    const pollFrame = (timestamp: number) => {
      const video = videoRef.current;
      if (video?.videoWidth && !inFlight && timestamp - lastSentAt >= 500) {
        lastSentAt = timestamp;
        inFlight = true;
        setBusy(true);
        const scale = Math.min(1, 640 / video.videoWidth);
        const nextWidth = Math.max(1, Math.round(video.videoWidth * scale));
        const nextHeight = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          setImageSize({ width: nextWidth, height: nextHeight });
        }
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob || cancelled) {
            inFlight = false;
            setBusy(false);
            return;
          }
          controller = new AbortController();
          const form = new FormData();
          form.append("image", blob, "live-webcam-frame.jpg");
          setLiveStatus("Looking for elephants…");
          void fetch("/api/inference", { method: "POST", body: form, signal: controller.signal })
            .then(async (response) => {
              const result = await response.json() as InferenceResult;
              if (!response.ok) throw new Error(result.error || "Live inference failed.");
              return result;
            })
            .then((result) => {
              if (cancelled) return;
              const found = Array.isArray(result.predictions) ? result.predictions : [];
              const elephants = found.filter((prediction) => /elephant/i.test(prediction.class));
              setPredictions(found);
              setImageSize({ width: canvas.width, height: canvas.height });
              setMetrics({ count: elephants.length, average: elephants.length
                ? elephants.reduce((sum, prediction) => sum + prediction.confidence, 0) / elephants.length
                : null });
              setError("");
              setLiveStatus(elephants.length
                ? `${elephants.length} elephant${elephants.length === 1 ? "" : "s"} detected`
                : "Monitoring live video · no elephants detected");
              const newTracks = elephants.filter((prediction) => {
                if (prediction.trackId == null || savedTrackIdsRef.current.has(prediction.trackId)) return false;
                savedTrackIdsRef.current.add(prediction.trackId);
                return true;
              });
              const untracked = elephants.filter((prediction) => prediction.trackId == null);
              if (newTracks.length || (untracked.length && !hadElephantRef.current)) {
                saveDetectedElephants([...newTracks, ...(hadElephantRef.current ? [] : untracked)]);
              }
              hadElephantRef.current = untracked.length > 0;
            })
            .catch((cause) => {
              if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
              setError(cause instanceof Error ? cause.message : "Live inference failed.");
              setLiveStatus("Live inference error · retrying…");
            })
            .finally(() => {
              inFlight = false;
              if (!cancelled) setBusy(false);
            });
        }, "image/jpeg", 0.78);
      }
      if (!cancelled) animationFrame = requestAnimationFrame(pollFrame);
    };

    animationFrame = requestAnimationFrame(pollFrame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      controller?.abort();
      setBusy(false);
    };
  }, [saveDetectedElephants, streaming]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  async function startCamera() {
    setError("");
    if (imageUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = "";
    setImageUrl("");
    setPredictions([]);
    setMetrics(null);
    setAnnotatedImageUrl("");
    hadElephantRef.current = false;
    savedTrackIdsRef.current.clear();
    sourceRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setStreaming(true);
    } catch {
      setError("Camera access was unavailable. Allow camera permission or upload an image instead.");
    }
  }

  function setImage(file: File) {
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setError("Choose an image file smaller than 10 MB.");
      return;
    }
    if (imageUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImageUrl(url);
    setPredictions([]);
    setMetrics(null);
    setAnnotatedImageUrl("");
    setError("");
    if (streamRef.current) stopCamera();
    const image = new Image();
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    setSource(file);
  }

  const sourceRef = useRef<File | Blob | null>(null);
  function setSource(file: File | Blob) { sourceRef.current = file; }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setImage(file);
    event.target.value = "";
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        if (imageUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current);
        const url = URL.createObjectURL(blob);
        imageUrlRef.current = url;
        setImageUrl(url);
        setImageSize({ width: canvas.width, height: canvas.height });
        setPredictions([]);
        setMetrics(null);
        setAnnotatedImageUrl("");
        setSource(blob);
        stopCamera();
      }
    }, "image/jpeg", 0.9);
  }

  async function runInference() {
    const image = sourceRef.current;
    if (!image) return;
    setBusy(true);
    setError("");
    setPredictions([]);
    setMetrics(null);
    setAnnotatedImageUrl("");
    try {
      const form = new FormData();
      form.append("image", image, "webcam-capture.jpg");
      const response = await fetch("/api/inference", { method: "POST", body: form });
      const result = await response.json() as InferenceResult;
      if (!response.ok) throw new Error(result.error || "Inference failed.");
      const found = Array.isArray(result.predictions) ? result.predictions : [];
      setPredictions(found);
      setMetrics({ count: result.count ?? found.length, average: result.averageConfidence ?? null });
      setAnnotatedImageUrl(result.annotatedImageUrl ?? "");
      saveDetectedElephants(found);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inference failed.");
    } finally {
      setBusy(false);
    }
  }

  const currentCamera = cameras.find((camera) => camera.id === cameraId);
  return (
    <Card title={<><Video size={19} /> Webcam & Elephant Detection</>} className="inference-card">
      <p className="muted">Start the webcam for continuous live detection, or upload an image for a single check. New elephant detections are saved to Sightings for review.</p>
      <div className="inference-controls">
        <label>Camera source
          <select value={cameraId} onChange={(event) => {
            const nextId = event.target.value;
            setCameraId(nextId);
            const found = cameras.find((camera) => camera.id === nextId);
            if (found) setZone(found.zone);
          }}>
            <option value="Webcam">Webcam</option>
            {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} · {ZONES[camera.zone]}</option>)}
          </select>
        </label>
        {!currentCamera && <label>Gewog
          <select value={zone} onChange={(event) => setZone(event.target.value as Zone)}>
            {allowedZones.map((id) => <option key={id} value={id}>{ZONES[id]}</option>)}
          </select>
        </label>}
        <button onClick={streaming ? stopCamera : startCamera}>{streaming ? <Square size={16} /> : <Camera size={16} />}{streaming ? "Stop camera" : "Start webcam"}</button>
        <button onClick={() => fileRef.current?.click()}><ImagePlus size={16} />Upload image</button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadImage} />
        {streaming && <button className="primary" onClick={captureFrame}><ScanLine size={16} />Capture still</button>}
        <button className="primary" disabled={!sourceRef.current || busy} onClick={runInference}>{busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{busy ? "Analyzing…" : "Run inference"}</button>
      </div>
      <div className="inference-workspace">
        <div className="inference-preview">
          {streaming && !imageUrl && <div className="inference-live-wrap" style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}>
            <video ref={videoRef} muted playsInline />
            <svg viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="none" aria-label="Live elephant detection boxes">
              {predictions.filter((prediction) => /elephant/i.test(prediction.class)).map((prediction, index) => <g key={`${prediction.class}-${index}`}>
                <rect x={prediction.x - prediction.width / 2} y={prediction.y - prediction.height / 2} width={prediction.width} height={prediction.height} />
                <text x={prediction.x - prediction.width / 2} y={Math.max(18, prediction.y - prediction.height / 2)}>{prediction.class}{prediction.trackId != null ? ` #${prediction.trackId}` : ""} {(prediction.confidence * 100).toFixed(1)}%</text>
              </g>)}
            </svg>
          </div>}
          {imageUrl && <div className="inference-image-wrap">
            <img src={annotatedImageUrl || imageUrl} alt={annotatedImageUrl ? "Image annotated with elephant detections" : "Image submitted for elephant detection"} />
            {!annotatedImageUrl && <svg viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {predictions.map((prediction, index) => <g key={`${prediction.class}-${index}`}>
                <rect x={prediction.x - prediction.width / 2} y={prediction.y - prediction.height / 2} width={prediction.width} height={prediction.height} />
                <text x={prediction.x - prediction.width / 2} y={Math.max(18, prediction.y - prediction.height / 2)}>{prediction.class} {(prediction.confidence * 100).toFixed(1)}%</text>
              </g>)}
            </svg>}
          </div>}
          {!streaming && !imageUrl && <div className="inference-empty"><Camera size={30} /><span>Start the webcam or upload an image</span></div>}
        </div>
        <div className="inference-results">
          <h3>Detection results</h3>
          {streaming && <p className="inference-live-status" role="status">{busy && <LoaderCircle className="spin" size={15} />}{liveStatus}</p>}
          {predictions.length ? <>
            <p>{metrics?.count ?? predictions.length} elephant detection(s){metrics?.average != null ? ` · ${(metrics.average * 100).toFixed(1)}% average confidence` : ""}</p>
            <ul>{predictions.map((prediction, index) => <li key={`${prediction.class}-${index}`}><b>{prediction.class}</b><span>{(prediction.confidence * 100).toFixed(1)}% confidence</span></li>)}</ul>
            <small className="muted">Review each saved sighting before treating it as confirmed.</small>
          </> : metrics ? <p>{metrics.count ? `${metrics.count} elephant detection(s)` : "No elephants detected."}{metrics.average != null ? ` · ${(metrics.average * 100).toFixed(1)}% average confidence` : ""}</p> : <p className="muted">Results will appear here after inference.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>
      <small className="muted">Inference runs locally with the project&apos;s best.pt model and Python dependencies.</small>
    </Card>
  );
}
