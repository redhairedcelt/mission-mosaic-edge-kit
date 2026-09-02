[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$kitRoot = Split-Path -Parent $PSScriptRoot
$duckdb = Join-Path $PSScriptRoot 'duckdb_cli\duckdb.exe'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required.'
}
if (-not (Test-Path -LiteralPath $duckdb -PathType Leaf)) {
    throw "Bundled DuckDB executable not found: $duckdb"
}

$database = (& node (Join-Path $PSScriptRoot 'mosaic-release.mjs') status --database).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $database -PathType Leaf)) {
    throw 'No valid active-release database was found.'
}

Write-Host 'Opening the active release database as read only:' -ForegroundColor Cyan
Write-Host "  $database"
Write-Host 'Type .tables to list objects. Type .exit to close DuckDB.'

Push-Location $kitRoot
try {
    & $duckdb -readonly $database
    if ($LASTEXITCODE -ne 0) {
        throw "DuckDB exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
