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
