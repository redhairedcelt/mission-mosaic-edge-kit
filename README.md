# Mission Mosaic encrypted participant Edge Kit

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

This offline kit lets a participant build and run local analytical tools while
the Aster Shield evidence advances through four facilitator-controlled
releases. The large encrypted packages are downloaded before the event. No
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
The ZIP contains the participant-safe reference library, Windows and macOS
DuckDB tools, and all four encrypted release packages.

## Start with Codex

1. Open the extracted folder as a local Codex workspace.
2. Send: `Read and follow prompts/STARTUP_PROMPT.md.`
3. Codex verifies the package and reports that no scenario release is active.
4. When the facilitator provides a release word, tell Codex:

   ```text
   Unlock the next release using WORD.
   ```

5. Codex runs the local unlock utility and reports the active release, cutoff,
   and database path.

The utility accepts release words case-insensitively. It only attempts the
next release, so it cannot skip forward or move backward.

For verification, unlock, read-only database, and writable workspace commands,
continue with [`START_HERE.md`](START_HERE.md). The release schedule, data
guide, and exclusions documents define the exact evidence and safety
boundaries.
