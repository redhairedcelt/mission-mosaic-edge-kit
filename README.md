# Mission Mosaic encrypted participant Edge Kit

> **FOR TRAINING PURPOSES ONLY - SYNTHETIC DATA**

This offline kit lets a participant build and run local analytical tools while
the Aster Shield evidence advances through four facilitator-controlled
releases. The large encrypted packages are downloaded before the event. No
Mission Mosaic server, API key, shared login, or Internet connection is needed
during play.

The repository does not contain release words, facilitator instructions,
ground truth, inject controls, scoring material, or answer products.

## Download

Open this repository's **Releases** page and download the current
`mission-mosaic-edge-kit-*.zip` asset. Do not use GitHub's automatically
generated source-code archives; they contain the documentation but not the
packaged encrypted data and platform tools.

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

## Direct commands

Node.js 20 or newer is required for release verification and unlocking.

```sh
node tools/mosaic-release.mjs verify
node tools/mosaic-release.mjs status
node tools/mosaic-release.mjs unlock WORD
```

Open the current database read-only on macOS:

```sh
sh tools/open_current_readonly.sh
```

Open it read-only on Windows:

```powershell
.\tools\open_current_readonly.ps1
```

To create or reopen an editable copy under `workspace/`, use
`sh tools/new_working_database.sh` on macOS or
`.\tools\new_working_database.ps1` on Windows.

Save applications, SQL, reports, charts, and working databases under
`workspace/`. The unlocked release directories are immutable source material.

## Releases

- `REL-AST-01`: cumulative participant evidence through H0.
- `REL-AST-02`: cumulative participant evidence through H+48.
- `REL-AST-03`: cumulative participant evidence through H+72.
- `H120`: cumulative participant-safe evidence for continued analysis after
  the facilitated outbrief.

See `RELEASE_SCHEDULE.md`, `DATA_GUIDE.md`, and `EXCLUSIONS.md` for the exact
boundaries.
