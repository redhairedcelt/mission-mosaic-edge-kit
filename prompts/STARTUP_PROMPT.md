# Copy/paste this into a new local Codex task

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

After reading `AGENTS.md`, `START_HERE.md`, `PREFLIGHT.md`,
`RELEASE_SCHEDULE.md`, `DATA_GUIDE.md`, and `EXCLUSIONS.md`, run
`node tools/mosaic-release.mjs verify` followed by
`node tools/mosaic-release.mjs status --json`. Follow the bounded automatic
recovery procedure in `AGENTS.md`; if safe recovery cannot complete, tell me
to flag the failure for a facilitator.

Use only the active release reported by the local release utility. A complete
package must start with `REL-AST-01` / H0 active. If no release is active, stop
and report an invalid package state. Treat `sealed/`, `released/`, and
`data/reference/` as immutable. Save every new file under `workspace/`.

When I say something equivalent to “unlock the next phase with code word WORD,”
run `node tools/mosaic-release.mjs unlock WORD` using the supplied uppercase
word exactly. The command performs bounded automatic recovery and verifies its
result. Do not guess, alter, or brute-force release words. If it fails, follow
the post-error status check in `AGENTS.md`. If that check does not confirm a
successful transition, tell me to flag the failure for a facilitator. After a
successful unlock, report the release identifier, cutoff, database path, and
evidence available.

Separate evidence from inference and support findings with record IDs and
saved SQL so the work is reproducible.
