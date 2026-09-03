[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$Name = 'analyst_work.duckdb'
)

$ErrorActionPreference = 'Stop'
$kitRoot = Split-Path -Parent $PSScriptRoot
$duckdb = Join-Path $PSScriptRoot 'duckdb_cli\duckdb.exe'
$workspace = Join-Path $kitRoot 'workspace'
$working = Join-Path $workspace $Name

if ([System.IO.Path]::GetExtension($working) -ne '.duckdb') {
    throw 'The working database name must end in .duckdb.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required.'
}
if (-not (Test-Path -LiteralPath $duckdb -PathType Leaf)) {
    throw "Bundled DuckDB executable not found: $duckdb"
}

$master = (& node (Join-Path $PSScriptRoot 'mosaic-release.mjs') status --database).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $master -PathType Leaf)) {
    throw 'No valid active-release database was found.'
}

New-Item -ItemType Directory -Force -Path $workspace | Out-Null
if (-not (Test-Path -LiteralPath $working -PathType Leaf)) {
    $temporary = "$working.tmp-$PID"
    try {
        Copy-Item -LiteralPath $master -Destination $temporary
        Move-Item -LiteralPath $temporary -Destination $working
    }
    finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
    Write-Host "Created working database: $working" -ForegroundColor Green
}
else {
    Write-Host "Reusing existing working database: $working" -ForegroundColor Yellow
}

Push-Location $kitRoot
try {
    & $duckdb $working
    if ($LASTEXITCODE -ne 0) {
        throw "DuckDB exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
