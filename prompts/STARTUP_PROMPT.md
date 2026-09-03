# Copy/paste this into a new local Codex task

Read `AGENTS.md`, `START_HERE.md`, `RELEASE_SCHEDULE.md`, `DATA_GUIDE.md`, and
`EXCLUSIONS.md`. Run `node tools/mosaic-release.mjs verify`, then run
`node tools/mosaic-release.mjs status --json`. Stop if verification fails.
If verification says this is the public source checkout, direct me to the
repository's Releases page; do not report the missing package files as damage.

Use only the active release reported by the local release utility. If no
release is active, use the plaintext reference library only and wait for a
release word or participant question. Treat `sealed/`, `released/`, and
`data/reference/` as immutable. Save every new file under `workspace/`.

When I explicitly give you an alphabetic release word and ask to start or
advance the scenario, run `node tools/mosaic-release.mjs unlock WORD`. Do not
guess or brute-force release words. After a successful unlock, report the
release identifier, cutoff, database path, and evidence available.

Separate evidence from inference and support findings with record IDs and
saved SQL so the work is reproducible.
