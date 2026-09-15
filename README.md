# Mission Mosaic encrypted participant Edge Kit

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

This offline kit lets a participant build and run local analytical tools while
the Aster Shield evidence advances from an active H0 baseline through two
facilitator-controlled updates. The large encrypted packages are downloaded before the event. No
Mission Mosaic server, API key, shared login, or Internet connection is needed
during play.

The repository does not contain release words, facilitator instructions,
ground truth, inject controls, scoring material, or answer products.

## Download

Open this repository's [**Releases** page](https://github.com/redhairedcelt/mission-mosaic-edge-kit/releases/latest) and download the current
`mission-mosaic-edge-kit-*.zip` asset. Do not use GitHub's automatically
generated source-code archives; they contain the documentation but not the
packaged encrypted data and platform tools.

A clone or source-code ZIP of this repository is publication documentation,
not a runnable kit. Its verification command deliberately directs users back
to the packaged release asset when the checksum manifest is absent.

Extract the ZIP to a normal writable folder. Keep the entire folder together.
The ZIP contains the active participant-safe H0 baseline, Windows and macOS
DuckDB tools, the reference library, and two encrypted cumulative updates.

## Start with Codex

1. Open the extracted folder as a local Codex workspace.
2. Send: `Read and follow prompts/STARTUP_PROMPT.md.`
3. Codex verifies the package and reports that the H0 baseline is active.
4. When the facilitator provides a release word, tell Codex:

   ```text
   Unlock the next release using WORD.
   ```

5. Codex runs the local unlock utility. The utility automatically repairs and
   retries one recoverable local error, verifies the result, and reports the
   active release, cutoff, and database path. If safe recovery fails, Codex
   tells the participant to flag the failure for a facilitator.

Enter each release word in uppercase exactly as the facilitator displays it.
The utility only attempts the next update, so it cannot skip forward or move
backward.

Before event day, the facilitation team should invoke the repeatable decryption
test in [`PREFLIGHT.md`](PREFLIGHT.md) once on every workstation. The script
runs two complete passes using both real encrypted updates without advancing the exercise. For ordinary
verification, unlock, read-only database, and writable workspace commands,
continue with [`START_HERE.md`](START_HERE.md). The release schedule, data
guide, and exclusions documents define the exact evidence and safety
boundaries.
