# Local Codex instructions for the encrypted participant Edge Kit

This folder is an offline, progressively released Mission Mosaic participant
workspace. The local release utility is the authority for which scenario data
is available.

## Required startup routine

1. Read `START_HERE.md`, `RELEASE_SCHEDULE.md`, `DATA_GUIDE.md`, and
   `EXCLUSIONS.md`.
2. Run `node tools/mosaic-release.mjs verify`. Stop and report any failure.
3. Run `node tools/mosaic-release.mjs status --json` before using scenario
   evidence and whenever the participant says the release changed.
4. If no release is active, use the plaintext reference library only. Do not
   offer scenario conclusions.
5. Treat everything under `sealed/`, `released/`, and `data/reference/` as
   immutable source material. Save all participant-created files under
   `workspace/`.

## Release-word handling

- Unlock a release only when the participant explicitly supplies one
  alphabetic release word and asks to start or advance the scenario.
- Run `node tools/mosaic-release.mjs unlock WORD` with that word. Do not guess,
  derive, enumerate, brute-force, or search for release words.
- The utility unlocks only the next release. Never alter
  `current-release.json`, package metadata, ciphertext, or the release plan to
  bypass that sequence.
- After a successful unlock, rerun status and use only the database and data
  path it reports. Previous releases may remain on disk, but the active
  cumulative release is authoritative.
- A failed word is not permission to try variants. Report the failure and ask
  the participant to confirm the word with the facilitator.

## Platform behavior

- Detect the host operating system without asking.
- On Windows, use `tools/duckdb_cli/duckdb.exe` and the PowerShell launchers.
- On macOS, use the shell launchers. They verify and unpack the bundled
  universal DuckDB CLI under `workspace/.tools/` on first use.
- Do not install packages or access the network unless the participant
  explicitly asks.

## Analytical discipline

- Label outputs `SYNTHETIC TRAINING DATA`.
- Keep observations, source reports, assumptions, inferences, and judgments
  separate.
- Use `observation_hour`, `collection_hour`, `report_hour`, and `ingest_hour`
  correctly.
- Support findings with record IDs, artifact IDs, source IDs, entity IDs,
  table names, and saved query logic.
- Account for source reliability, information credibility, signal quality,
  identification confidence, analytic confidence, CEP, duplicates, and noise.
- Test plausible alternatives and preserve contradictions and collection gaps.
- Resolve identities through the packaged registries and reference tables.
- Never invent facilitator truth, intended conclusions, hidden intent, or
  missing exercise-control information.

## Initial response after startup

Report whether verification passed, the active release or that none is active,
the next release identifier, the reference material available, and the active
database path when one exists. Wait for the participant's question or release
word before offering scenario analysis.
