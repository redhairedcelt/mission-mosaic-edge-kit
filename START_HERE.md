# Start here

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

This is the offline Mission Mosaic participant workspace. It contains a
plaintext reference library and four encrypted, cumulative evidence releases.
The facilitator provides one release word at each authorized transition.

## Confirm that you have the runnable kit

Use the versioned `mission-mosaic-edge-kit-*.zip` from this repository's
[Releases page](https://github.com/redhairedcelt/mission-mosaic-edge-kit/releases/latest).
Do not use GitHub's automatically generated source-code ZIP. A clone or source
checkout contains these instructions, but it deliberately omits the encrypted
packages, platform tools, and checksum manifest.

## Fastest start

1. Keep the extracted kit together in a writable folder.
2. Open that folder in Codex.
3. Send: `Read and follow prompts/STARTUP_PROMPT.md.`
4. Wait for package verification and release status.
5. When the facilitator announces a release word, tell Codex to unlock the
   next release using that word.

Codex runs the same cross-platform Node.js utility on Windows and macOS. A
successful unlock decrypts and verifies the next release locally, updates
`current-release.json`, and reports the active read-only database path.

## Manual operations

Run these commands from the root of the extracted release asset. Node.js 20 or
newer is required for release verification and unlocking.

```sh
node tools/mosaic-release.mjs verify
node tools/mosaic-release.mjs status
node tools/mosaic-release.mjs unlock WORD
```

If `verify` identifies a public source checkout, stop and download the
versioned release asset. Do not try to construct missing package files from the
source tree.

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
Run `node tools/mosaic-release.mjs verify` again if the extracted kit is moved,
copied, or reopened later; it also checks the active release when one exists.

## What happens at each transition

| Role | Action |
|---|---|
| Facilitator | Announces the authorized word for the next release. |
| Participant | Gives that word to Codex and explicitly asks it to unlock the next release. |
| Codex | Runs verification, unlocks only the next release, then reports status. It never guesses or searches for a word. |
| Analyst | Uses only the newest active cumulative database and saves all work under `workspace/`. |

## Important boundaries

- Before the first unlock, no scenario evidence is available.
- Each package is cumulative, so use the newest active release.
- H120 is for continued analysis after the facilitated outbrief.
- The kit never contains facilitator ground truth or exercise-control files.
- Do not edit anything under `sealed/`, `released/`, or `data/reference/`.
- Save your work under `workspace/`.
