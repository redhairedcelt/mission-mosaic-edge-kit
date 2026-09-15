# Release decryption preflight

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

Run this test on every facilitation workstation after downloading and
extracting the versioned Edge Kit. It decrypts and validates both real sealed
updates in a temporary directory, then deletes the test data. It does not
change `current-release.json` or advance the exercise.

## Windows procedure

1. Compare the downloaded ZIP's SHA-256 value with its accompanying
   `.sha256` file.
2. Extract the ZIP to a short local path such as
   `C:\MissionMosaic\edge-kit`. Do not run it inside the ZIP, OneDrive, a
   network share, or a read-only folder.
3. Open PowerShell in the extracted kit root.
4. Run:

   ```powershell
   .\tools\test_release_decryption.ps1
   ```

5. Enter the two authorized words in uppercase exactly as issued. They are
   hidden while typed and are not placed on the command line or written to the
   report.
6. The script runs two complete passes. Require `Overall result: PASS` for both
   releases on both passes. Preserve
   `workspace\release-preflight-report.txt` with the event setup record.
   Repetition checks that temporary extraction and cleanup are reliable on that
   workstation.

If PowerShell policy blocks the signed-local script, run this once from the kit
root instead:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\test_release_decryption.ps1
```

## macOS procedure

From Terminal in the extracted kit root, run:

```sh
sh tools/test_release_decryption.sh
```

## What the test covers

- complete package and ciphertext checksums;
- Node.js version and local free space;
- local file creation, atomic state replacement, populated-directory rename,
  and deletion;
- the actual scrypt, AES-256-GCM, gzip, and archive extraction path;
- every decrypted file's path, size, and SHA-256 checksum;
- temporary-directory cleanup; and
- confirmation that the active exercise release did not change.

## Recovery sequence

If the test or a live unlock fails:

1. Save `workspace\release-preflight-report.txt` and the exact terminal error.
2. Close DuckDB, editors, Explorer preview panes, and terminals whose current
   directory is inside `released`. Pause OneDrive or endpoint scanning if local
   policy permits.
3. Run `node tools/mosaic-release.mjs repair`. This removes only recognized
   temporary extraction and state files; it does not remove an activated
   release or participant work.
4. Run `node tools/mosaic-release.mjs verify`.
5. Retry the same authorized word. A release that finished decryption before
   activation will be verified and activated without being decrypted again.
6. If the error persists, extract a fresh ZIP to a short local path with at
   least 1 GiB free and invoke the preflight again. Each invocation performs
   two complete passes. Keep the original kit for diagnosis; do not edit
   `sealed`, `released`, or `current-release.json`.

Error codes such as `EPERM`, `EACCES`, `EBUSY`, `ENOTEMPTY`, and
`ENAMETOOLONG` indicate a local filesystem, lock, or path problem rather than
an incorrect word. An authentication failure after package verification
usually means the wrong word was entered. A ciphertext checksum failure means
the download or extraction is damaged and should be replaced.
