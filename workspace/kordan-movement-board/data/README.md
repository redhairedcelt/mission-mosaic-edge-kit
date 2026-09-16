# Portable snapshot directory

`snapshot.json` is generated participant data and is intentionally ignored by Git.
It may contain evidence available only after an authorized Mission Mosaic release.
Do not publish it or use it to bypass the progressive release sequence.

With an authorized release-aware board running locally, generate the snapshot:

```powershell
node tools/export-from-running-board.mjs http://127.0.0.1:4175
```

The standalone server falls back to `snapshot.example.json` when no participant
snapshot is present.
