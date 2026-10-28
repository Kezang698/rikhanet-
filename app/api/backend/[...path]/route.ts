import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join("/");
  const imageRoute = /^sightings\/[0-9a-f-]{36}\/image$/i.test(route);
  const importRoute = route === "imports/sightings";
  const readable = /^(health|gewogs|sightings|predictions|rangers|alerts|reports|settings|config|audit|notifications|auth\/(status|me)|(?:sightings|predictions)\/[0-9a-f-]{36}|sightings\/[0-9a-f-]{36}\/review)$/i.test(route) || imageRoute;
  const writable = /^(ingest|observations|rangers|reports|notifications\/(read|retry)|auth\/(setup|login|logout|forgot|reset|password|mfa\/(setup|enable|disable))|enrich\/[0-9a-f-]{36})$/i.test(route) || importRoute;
  const patchable = /^(sightings\/[0-9a-f-]{36}\/(detection|review)|(?:rangers|alerts|reports)\/[0-9a-f-]{36}|auth\/profile|settings)$/i.test(route);
  if (!(request.method === "GET" && readable || request.method === "POST" && writable || request.method === "PATCH" && patchable || request.method === "PUT" && imageRoute)) {
    return NextResponse.json({ detail: "Unknown API route" }, { status: 404 });
  }
  try {
    const base = process.env.RIKHANET_API_URL || "http://127.0.0.1:8000";
    const url = new URL(`${base.replace(/\/$/, "")}/${route}`);
    url.search = new URL(request.url).search;
    const headers: Record<string, string> = { Accept: "application/json" };
    for (const name of ["cookie", "origin", "x-csrf-token", "x-rikhanet-request"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const key = request.headers.get("Idempotency-Key");
    if (key) headers["Idempotency-Key"] = key;
    const maxBytes = imageRoute ? 10 * 1024 * 1024 : importRoute ? 2_000_000 : 65_536;
    if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) return NextResponse.json({ detail: "Upload exceeds the size limit" }, { status: 413 });
    let body: Uint8Array | undefined;
    if (request.method !== "GET") {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const reader = request.body?.getReader();
      if (reader) while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); return NextResponse.json({ detail: "Upload exceeds the size limit" }, { status: 413 }); }
        chunks.push(chunk.value);
      }
      body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      headers["Content-Type"] = request.headers.get("Content-Type") || "application/json";
    }
    const response = await fetch(url, { method: request.method, headers, body: body ? Buffer.from(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000) });
    const resultHeaders = new Headers({ "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const cookie of response.headers.getSetCookie()) resultHeaders.append("Set-Cookie", cookie);
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  } catch {
    return NextResponse.json({ detail: "Backend unavailable. Start PostgreSQL and the RiKhaNET API, then retry." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
