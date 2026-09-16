# Kordan Movement Board — standalone participant app

**FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

This offline message-board-style dashboard tracks Kordan military and related
civilian vessel movements. It keeps source observations, reported information,
and bounded analytic judgments visibly separate and links findings to the
supporting record or artifact IDs included in a participant snapshot.

The application has no package dependencies, does not access the network, and
does not require DuckDB after a snapshot has been exported. Node.js 20 or newer
is required.

## Create a participant snapshot

Snapshots can contain progressively released exercise evidence and are therefore
participant-local files. `data/snapshot.json` is intentionally ignored by Git.
Do not commit or publish it.

From an authorized packaged Edge Kit, start the release-aware movement board.
Then run this command from this directory while that board is available at the
given local URL:

```powershell
node tools/export-from-running-board.mjs http://127.0.0.1:4175
```

The export includes dashboard views, vessel tracks, map geometry, and supporting
evidence already available in the active release. It does not include release
words, ciphertext, facilitator truth, or exercise-control material.

## Run standalone

On Windows:

```powershell
.\start.ps1 -Port 4185 -Open
```

On macOS or Linux:

```sh
PORT=4185 OPEN_BROWSER=1 sh start.sh
```

After export, the release-aware board can be stopped; this app reads only the
local snapshot. Without `data/snapshot.json`, it safely opens an empty example
view.

## Verify

```powershell
npm test
node --check server.mjs
node --check public/app.js
```

Analytic conclusions in the feed remain assessments, not facilitator truth.
Review confidence, source reliability, credibility, signal quality, competing
hypotheses, contradictions, noise, and collection gaps before relying on them.
