import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(APP_DIR, "public");
const DEFAULT_SNAPSHOT = path.join(APP_DIR, "data", "snapshot.json");
const EXAMPLE_SNAPSHOT = path.join(APP_DIR, "data", "snapshot.example.json");
const TRAINING_LABEL = "FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA";
const ALLOWED_WINDOWS = [48, 72, 120, 456];
const streamClients = new Set();

let snapshotCache = { path: "", modified: 0, value: null };

function clampNumber(value, minimum, maximum, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function nearestWindow(value) {
  const numeric = clampNumber(value, 1, 10_000, 120);
  return ALLOWED_WINDOWS.reduce((best, current) => (
    Math.abs(current - numeric) < Math.abs(best - numeric) ? current : best
  ), ALLOWED_WINDOWS[0]);
}

function validateSnapshot(snapshot) {
  if (snapshot?.schema_version !== "mission-mosaic-movement-board-snapshot-v1") {
    throw new Error("Unsupported or missing movement-board snapshot schema.");
  }
  if (!snapshot.views || typeof snapshot.views !== "object") {
    throw new Error("The movement-board snapshot has no views.");
  }
  return snapshot;
}

async function readSnapshot(snapshotPath = DEFAULT_SNAPSHOT, force = false) {
  let selectedPath = snapshotPath;
  try {
    await fs.access(selectedPath);
  } catch {
    selectedPath = EXAMPLE_SNAPSHOT;
  }
  const stat = await fs.stat(selectedPath);
  if (!force && snapshotCache.value && snapshotCache.path === selectedPath && snapshotCache.modified === stat.mtimeMs) {
    return snapshotCache.value;
  }
  const value = validateSnapshot(JSON.parse(await fs.readFile(selectedPath, "utf8")));
  snapshotCache = { path: selectedPath, modified: stat.mtimeMs, value };
  return value;
}

function chooseView(snapshot, windowValue) {
  const requested = String(nearestWindow(windowValue));
  return snapshot.views[requested] ?? snapshot.views["120"] ?? Object.values(snapshot.views)[0];
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

async function serveStatic(response, pathname) {
  const routes = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/app.css": ["app.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  };
  const target = routes[pathname];
  if (!target) return false;
  const content = await fs.readFile(path.join(PUBLIC_DIR, target[0]));
  response.writeHead(200, {
    "Content-Type": target[1],
    "Content-Length": content.length,
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  });
  response.end(content);
  return true;
}

function stream(response, snapshot) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(`event: connected\ndata: ${JSON.stringify({
    connected: true,
    mode: "standalone_snapshot",
    active_release: snapshot.source_release?.activeRelease ?? null,
    classification: TRAINING_LABEL,
  })}\n\n`);
  streamClients.add(response);
}

async function handleApi(request, response, url, snapshotPath) {
  const force = url.searchParams.get("refresh") === "true";
  const snapshot = await readSnapshot(snapshotPath, force);
  const requestedWindow = url.searchParams.get("window");
  const view = chooseView(snapshot, requestedWindow);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      mode: "standalone_snapshot",
      active_release: snapshot.source_release?.activeRelease ?? null,
      cutoff_hour: snapshot.source_release?.cutoffHour ?? null,
      exported_at: snapshot.exported_at,
      example_data: Boolean(snapshot.example_data),
      training_data: true,
      classification: TRAINING_LABEL,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    return sendJson(response, 200, {
      ...view.dashboard,
      standalone_snapshot: true,
      snapshot_exported_at: snapshot.exported_at,
      example_data: Boolean(snapshot.example_data),
    });
  }
  if (request.method === "GET" && url.pathname === "/api/tracks") {
    const start = Number(url.searchParams.get("start"));
    const end = Number(url.searchParams.get("end"));
    const derivedWindow = Number.isFinite(start) && Number.isFinite(end) ? Math.abs(end - start) : requestedWindow;
    const trackView = chooseView(snapshot, derivedWindow);
    const requestedMmsi = new Set(String(url.searchParams.get("mmsi") ?? "").split(",").filter(Boolean));
    const tracks = requestedMmsi.size
      ? trackView.tracks.filter((point) => requestedMmsi.has(point.mmsi))
      : trackView.tracks;
    return sendJson(response, 200, {
      tracks,
      mode: "standalone_snapshot",
      active_release: snapshot.source_release?.activeRelease ?? null,
      classification: TRAINING_LABEL,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/map") {
    return sendJson(response, 200, snapshot.map ?? { type: "FeatureCollection", features: [] });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/evidence/")) {
    const identifier = decodeURIComponent(url.pathname.slice("/api/evidence/".length));
    if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(identifier)) {
      return sendJson(response, 400, { error: "Invalid evidence identifier.", classification: TRAINING_LABEL });
    }
    const evidence = snapshot.evidence?.[identifier];
    if (!evidence) {
      return sendJson(response, 404, {
        error: "Evidence is not included in this portable snapshot.",
        classification: TRAINING_LABEL,
      });
    }
    return sendJson(response, 200, evidence);
  }
  if (request.method === "GET" && url.pathname === "/api/stream") {
    stream(response, snapshot);
    request.on("close", () => streamClients.delete(response));
    return;
  }
  return sendJson(response, 404, { error: "API endpoint not found.", classification: TRAINING_LABEL });
}

export function createAppServer({ snapshotPath = DEFAULT_SNAPSHOT } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url, snapshotPath);
      if (request.method === "GET" && await serveStatic(response, url.pathname)) return;
      sendJson(response, 404, { error: "Not found.", classification: TRAINING_LABEL });
    } catch (error) {
      sendJson(response, 500, { error: error.message, training_data: true, classification: TRAINING_LABEL });
    }
  });
}

export async function startServer({
  port = Number(process.env.PORT) || 4175,
  openBrowser = process.env.OPEN_BROWSER === "1",
  snapshotPath = process.env.MOVEMENT_BOARD_SNAPSHOT || DEFAULT_SNAPSHOT,
} = {}) {
  await readSnapshot(snapshotPath, true);
  const server = createAppServer({ snapshotPath });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;
  if (openBrowser && process.platform === "win32") {
    execFile("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process '${url}'`], { windowsHide: true });
  }
  return { server, port: actualPort, url };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    const { url } = await startServer();
    console.log(TRAINING_LABEL);
    console.log(`Standalone Kordan Movement Board listening at ${url}`);
    console.log("Press Ctrl+C to stop.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
