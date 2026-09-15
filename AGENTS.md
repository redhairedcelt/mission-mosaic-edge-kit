# Local Codex instructions for the encrypted participant Edge Kit

This folder is an offline, progressively released Mission Mosaic participant
workspace. The local release utility is the authority for which scenario data
is available.

## Required startup routine

1. Read `START_HERE.md`, `PREFLIGHT.md`, `RELEASE_SCHEDULE.md`,
   `DATA_GUIDE.md`, and `EXCLUSIONS.md`.
2. Run `node tools/mosaic-release.mjs verify`. If it reports an interrupted
   temporary path, run `node tools/mosaic-release.mjs repair` and repeat
   verification once. If either attempt fails, tell the participant to flag
   the failure for a facilitator. If the checksum manifest is absent, explain
   that this is the public source checkout rather than the complete release
   package and tell the participant to flag the need for a packaged kit with a
   facilitator. Do not describe that expected source-tree condition as kit
   corruption.
3. Run `node tools/mosaic-release.mjs status --json` before using scenario
   evidence and whenever the participant says the release changed. A complete
   package starts with `REL-AST-01` / H0 active.
4. If no release is active, stop and report that the packaged starting state
   is invalid. A public source checkout has no runnable release data.
5. Treat everything under `sealed/`, `released/`, and `data/reference/` as
   immutable source material. Save all participant-created files under
   `workspace/`.

## Release-word handling

- Treat requests such as “unlock the next phase with code word WORD” as an
  explicit request to advance the next release. Do not ask the participant to
  restate the request or run a command.
- Run `node tools/mosaic-release.mjs unlock WORD` with the uppercase word
  exactly as supplied. Do not guess, derive, enumerate, brute-force, alter the
  word's case, or search for release words.
- The unlock command verifies the result and performs at most one automatic
  repair-and-retry cycle for a recoverable local filesystem or activation
  error. Let that command finish; do not launch a second unlock concurrently.
- The utility unlocks only the next release. Never alter
  `current-release.json`, package metadata, ciphertext, or the release plan to
  bypass that sequence.
- After a successful unlock, use the active release and database path printed
  by the command. Previous releases may remain on disk, but the active
  cumulative release is authoritative.
- If the command exits with an error, run `node tools/mosaic-release.mjs status
  --json` once. Only if it shows the expected next release active, run `verify`;
  treat the transition as successful when both checks pass.
- Otherwise report that the release could not be completed safely and tell the
  participant: “I could not complete the release safely. Please flag this for
  a facilitator.” The facilitator will take over recovery.

## Platform behavior

- Detect the host operating system without asking.
- On Windows, use `tools/duckdb_cli/duckdb.exe` and the PowerShell launchers.
- On macOS, use the shell launchers. They verify and unpack the bundled
  universal DuckDB CLI under `workspace/.tools/` on first use.
- Do not install packages or access the network as part of release recovery.

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

Report whether verification passed, confirm that the H0 baseline is active,
name the next release identifier, summarize the reference material available,
and report the active database path. Wait for the participant's question or
release word before offering scenario analysis.
