import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(TEST_DIR, "fixtures", "snapshot.json");

test("serves a portable snapshot without release-kit dependencies", async (context) => {
  const { server, url } = await startServer({ port: 0, openBrowser: false, snapshotPath: SNAPSHOT });
  context.after(async () => new Promise((resolve) => server.close(resolve)));

  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.mode, "standalone_snapshot");
  assert.equal(health.active_release, "REL-TEST-01");

  const dashboard = await (await fetch(`${url}/api/dashboard?window=120`)).json();
  assert.equal(dashboard.metrics.related_civilians, 1);
  assert.equal(dashboard.standalone_snapshot, true);

  const tracks = await (await fetch(`${url}/api/tracks?start=0&end=120`)).json();
  assert.equal(tracks.tracks[0].record_id, "AIS-TEST-001");

  const evidence = await (await fetch(`${url}/api/evidence/AIS-TEST-001`)).json();
  assert.equal(evidence.record.vessel_name, "MV Test");

  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Kordan Movement Board/);
});

test("rejects unavailable evidence cleanly", async (context) => {
  const { server, url } = await startServer({ port: 0, openBrowser: false, snapshotPath: SNAPSHOT });
  context.after(async () => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`${url}/api/evidence/ART-MISSING`);
  assert.equal(response.status, 404);
});
