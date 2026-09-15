# Start here

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

This is the offline Mission Mosaic participant workspace. It starts with an
active H0 baseline and contains two encrypted, cumulative evidence updates.
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
4. Wait for package verification and confirmation that H0 is active.
5. When the facilitator announces a release word, tell Codex to unlock the
   next release using that word. Codex runs verification and bounded recovery.

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

Facilitators should test the actual decryption path before event day. On
Windows, run `.\tools\test_release_decryption.ps1`; on macOS, run
`sh tools/test_release_decryption.sh`. See [`PREFLIGHT.md`](PREFLIGHT.md).
The test is repeatable and does not advance the active release.

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
If verification reports an interrupted temporary extraction, run
`node tools/mosaic-release.mjs repair`, rerun verification, and retry the same
authorized word.

The `unlock` command itself performs at most one automatic repair and retry for
a recoverable local error, then verifies and prints the active release. If it
cannot finish safely, Codex tells the participant to flag the failure for a
facilitator, who can take over recovery.

## What happens at each transition

| Role | Action |
|---|---|
| Facilitator | Announces the authorized word for the next release. |
| Participant | Gives that word to Codex and explicitly asks it to unlock the next release. |
| Codex | Unlocks only the next update, automatically repairs and retries once when safe, verifies the result, then reports status or asks the participant to flag the failure for a facilitator. |
| Analyst | Uses only the newest active cumulative database and saves all work under `workspace/`. |

## Important boundaries

- H0 is active when the complete release asset is opened.
- Each update is cumulative, so use the newest active release.
- H72 is the decision dataset. Save the participant brief before advancing.
- H120 supports the final application refresh before the facilitated outbrief.
- The kit never contains facilitator ground truth or exercise-control files.
- Do not edit anything under `sealed/`, `released/`, or `data/reference/`.
- Save your work under `workspace/`.
