import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(TOOL_DIR, "..");
const OUTPUT = path.join(APP_DIR, "data", "snapshot.json");
const WINDOWS = [48, 72, 120, 456];
const baseUrl = new URL(process.argv[2] || "http://127.0.0.1:4175");

async function getJson(pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(`${url.pathname}: ${body.error || response.statusText}`);
  return body;
}

const health = await getJson("/api/health");
if (!health.active_release || health.example_data) {
  throw new Error("The source board does not expose an active authorized release.");
}

const views = {};
const evidenceIds = new Set();
for (const window of WINDOWS) {
  const dashboard = await getJson(`/api/dashboard?window=${window}`);
  const tracksBody = await getJson(`/api/tracks?start=${dashboard.filters.start}&end=${dashboard.filters.end}&cutoff=${dashboard.filters.cutoff}&min_quality=2&max_points=260`);
  views[String(window)] = { dashboard, tracks: tracksBody.tracks };
  dashboard.feed.forEach((post) => (post.evidence_ids || []).forEach((identifier) => evidenceIds.add(identifier)));
  dashboard.vessels.forEach((vessel) => {
    [vessel.latest_record_id, vessel.hull_id, vessel.home_facility, vessel.mmsi, vessel.latest_collector_id]
      .filter(Boolean)
      .forEach((identifier) => evidenceIds.add(identifier));
  });
}

const evidence = {};
const skipped = [];
const pendingEvidence = [...evidenceIds].sort();
const batchSize = 8;
console.log(`Exporting ${pendingEvidence.length} supporting evidence references…`);
for (let index = 0; index < pendingEvidence.length; index += batchSize) {
  const batch = pendingEvidence.slice(index, index + batchSize);
  await Promise.all(batch.map(async (identifier) => {
    try {
      evidence[identifier] = await getJson(`/api/evidence/${encodeURIComponent(identifier)}?cutoff=${health.cutoff_hour}`);
    } catch (error) {
      skipped.push({ identifier, error: error.message });
    }
  }));
  if (index + batchSize < pendingEvidence.length) {
    console.log(`Exported ${Math.min(index + batchSize, pendingEvidence.length)}/${pendingEvidence.length} references…`);
  }
}

const snapshot = {
  schema_version: "mission-mosaic-movement-board-snapshot-v1",
  exported_at: new Date().toISOString(),
  classification: "FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA",
  source_release: {
    activeRelease: health.active_release,
    cutoffHour: health.cutoff_hour,
    database: health.database ?? null,
  },
  source_url: baseUrl.origin,
  export_notes: {
    availability: "The source dashboard applied ingest_hour as the availability cutoff and observation_hour as activity time.",
    scope: "Portable participant snapshot; no release words, ciphertext, facilitator truth, or exercise-control material.",
    skipped_evidence: skipped,
  },
  views,
  map: await getJson("/api/map"),
  evidence,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Wrote ${OUTPUT}`);
console.log(`Release: ${snapshot.source_release.activeRelease} / H+${snapshot.source_release.cutoffHour}`);
console.log(`Views: ${Object.keys(views).join(", ")} hours; evidence records: ${Object.keys(evidence).length}; skipped: ${skipped.length}`);
