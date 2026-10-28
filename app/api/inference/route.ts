import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STARTUP_TIMEOUT_MS = 120_000;
const INFERENCE_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const WORKER_PROTOCOL_MARKER = "@@RIKHANET@@";
const WORKER_PROTOCOL_VERSION = 2;

interface Prediction {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
}

interface WorkerReply {
  id?: number;
  ready?: boolean;
  protocolVersion?: number;
  predictions?: Prediction[];
  image?: { width?: number; height?: number };
  error?: string;
}

interface PendingRequest {
  resolve: (reply: WorkerReply) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface LocalModelWorker {
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  nextId: number;
  ready: Promise<void>;
  lineBuffer: string;
  stderr: string;
  protocolVersion: number;
}

type WorkerGlobal = typeof globalThis & {
  __rikhanetLocalModelWorker?: LocalModelWorker;
};

const workerGlobal = globalThis as WorkerGlobal;

function pythonExecutable() {
  const configured = process.env.RIKHANET_PYTHON;
  if (configured) return configured;

  const root = process.cwd();
  const venv = path.join(
    root,
    "inference",
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  const venvConfig = path.join(root, "inference", ".venv", "pyvenv.cfg");
  if (existsSync(venv) && existsSync(venvConfig)) return venv;
  return process.platform === "win32" ? "python" : "python3";
}

function rejectPending(worker: LocalModelWorker, error: Error) {
  for (const pending of worker.pending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  worker.pending.clear();
}

function getLocalModelWorker(): LocalModelWorker {
  const existing = workerGlobal.__rikhanetLocalModelWorker;
  if (existing?.protocolVersion === WORKER_PROTOCOL_VERSION) return existing;
  existing?.child.kill();
  delete workerGlobal.__rikhanetLocalModelWorker;

  const root = process.cwd();
  const script = path.join(root, "inference", "worker.py");
  const child = spawn(pythonExecutable(), [script], {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const worker: LocalModelWorker = {
    child,
    pending: new Map(),
    nextId: 1,
    ready,
    lineBuffer: "",
    stderr: "",
    protocolVersion: WORKER_PROTOCOL_VERSION,
  };
  workerGlobal.__rikhanetLocalModelWorker = worker;

  const startupTimeout = setTimeout(() => {
    const error = new Error("Local YOLO model startup timed out.");
    rejectReady(error);
    child.kill();
  }, STARTUP_TIMEOUT_MS);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    worker.lineBuffer += chunk;
    if (Buffer.byteLength(worker.lineBuffer) > MAX_OUTPUT_BYTES) {
      child.kill();
      return;
    }
    let newline = worker.lineBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = worker.lineBuffer.slice(0, newline);
      worker.lineBuffer = worker.lineBuffer.slice(newline + 1);
      newline = worker.lineBuffer.indexOf("\n");
      if (!line) continue;
      const markerIndex = line.lastIndexOf(WORKER_PROTOCOL_MARKER);
      if (markerIndex < 0) continue;
      let reply: WorkerReply;
      try {
        reply = JSON.parse(line.slice(markerIndex + WORKER_PROTOCOL_MARKER.length)) as WorkerReply;
      } catch {
        continue;
      }
      if (typeof reply.ready === "boolean") {
        clearTimeout(startupTimeout);
        if (reply.protocolVersion !== WORKER_PROTOCOL_VERSION) {
          rejectReady(new Error("The local YOLO worker needs to be restarted."));
          child.kill();
        } else if (reply.ready) resolveReady();
        else rejectReady(new Error(reply.error || "The local YOLO model could not start."));
        continue;
      }
      if (typeof reply.id !== "number") continue;
      const pending = worker.pending.get(reply.id);
      if (!pending) continue;
      clearTimeout(pending.timeout);
      worker.pending.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error));
      else pending.resolve(reply);
    }
  });
  child.stderr.on("data", (chunk: string) => {
    worker.stderr = (worker.stderr + chunk).slice(-4000);
  });
  child.on("error", (error) => {
    clearTimeout(startupTimeout);
    rejectReady(error);
    rejectPending(worker, error);
    if (workerGlobal.__rikhanetLocalModelWorker === worker) {
      delete workerGlobal.__rikhanetLocalModelWorker;
    }
  });
  child.on("close", (code) => {
    clearTimeout(startupTimeout);
    const detail = worker.stderr.trim().slice(-1000);
    const error = new Error(
      detail || `Local YOLO worker exited${code === null ? "" : ` (${code})`}.`,
    );
    rejectReady(error);
    rejectPending(worker, error);
    if (workerGlobal.__rikhanetLocalModelWorker === worker) {
      delete workerGlobal.__rikhanetLocalModelWorker;
    }
  });

  return worker;
}

async function runLocalModel(image: Buffer): Promise<WorkerReply> {
  const worker = getLocalModelWorker();
  await worker.ready;

  const id = worker.nextId++;
  const encoded = image.toString("base64");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.pending.delete(id);
      reject(new Error("Local YOLO inference timed out."));
    }, INFERENCE_TIMEOUT_MS);
    worker.pending.set(id, { resolve, reject, timeout });
    worker.child.stdin.write(`${JSON.stringify({ id, image: encoded })}\n`, (error) => {
      if (!error) return;
      clearTimeout(timeout);
      worker.pending.delete(id);
      reject(error);
    });
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload an image to run inference." }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "The image file is missing." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 415 });
  }
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Choose an image smaller than 10 MB." }, { status: 413 });
  }

  try {
    const result = await runLocalModel(Buffer.from(await image.arrayBuffer()));
    const predictions = result.predictions ?? [];
    const averageConfidence = predictions.length
      ? predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / predictions.length
      : null;
    return NextResponse.json({
      predictions,
      count: predictions.length,
      averageConfidence,
      image: result.image,
      model: "best.pt",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local model inference failed.";
    const missingPython = error instanceof Error && "code" in error && error.code === "ENOENT";
    const missingDependencies = message.includes("dependencies are missing");
    const missingModel = message.includes("best.pt");
    console.error("Local YOLO inference failed", message);
    return NextResponse.json(
      {
        error: missingPython
          ? "Python was not found. Install Python and the packages in inference/requirements.txt."
          : message,
      },
      { status: missingPython || missingDependencies || missingModel ? 503 : message.includes("timed out") ? 504 : 502 },
    );
  }
}
