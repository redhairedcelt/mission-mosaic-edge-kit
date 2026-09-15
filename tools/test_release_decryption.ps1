[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$kitRoot = Split-Path -Parent $PSScriptRoot
$releaseTool = Join-Path $PSScriptRoot 'mosaic-release.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required. Install it, reopen PowerShell, and rerun this test.'
}

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<Major>\d+)\.') {
    throw 'The Node.js version could not be determined.'
}
if ([int]$Matches.Major -lt 20) {
    throw "Node.js 20 or newer is required; found $nodeVersion."
}

Write-Host 'Mission Mosaic release decryption preflight' -ForegroundColor Cyan
Write-Host 'This tests both encrypted updates without advancing the exercise state.'
Write-Host 'Run it from a short, local, writable folder rather than OneDrive or a network share.'

Push-Location $kitRoot
try {
    & node $releaseTool repair
    if ($LASTEXITCODE -ne 0) {
        throw "Release workspace repair failed with exit code $LASTEXITCODE."
    }

    $firstSecure = Read-Host 'Enter the first authorized release word' -AsSecureString
    $secondSecure = Read-Host 'Enter the second authorized release word' -AsSecureString
    $firstCredential = New-Object System.Management.Automation.PSCredential('unused', $firstSecure)
    $secondCredential = New-Object System.Management.Automation.PSCredential('unused', $secondSecure)
    $firstPlain = $firstCredential.GetNetworkCredential().Password
    $secondPlain = $secondCredential.GetNetworkCredential().Password

    for ($pass = 1; $pass -le 2; $pass++) {
        Write-Host "Running decryption preflight pass $pass of 2." -ForegroundColor Cyan
        @($firstPlain, $secondPlain) | & node $releaseTool preflight --stdin
        if ($LASTEXITCODE -ne 0) {
            throw "Release decryption preflight pass $pass failed with exit code $LASTEXITCODE. See workspace\release-preflight-report.txt."
        }
    }

    & node $releaseTool status
    if ($LASTEXITCODE -ne 0) {
        throw "Release status check failed with exit code $LASTEXITCODE."
    }
    Write-Host 'Both preflight passes succeeded. The exercise release state was not advanced.' -ForegroundColor Green
}
finally {
    $firstPlain = $null
    $secondPlain = $null
    $firstCredential = $null
    $secondCredential = $null
    $firstSecure = $null
    $secondSecure = $null
    Pop-Location
}
