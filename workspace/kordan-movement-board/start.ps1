param(
  [int]$Port = 4175,
  [switch]$Open
)

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PORT = $Port
$env:OPEN_BROWSER = if ($Open) { "1" } else { "0" }
Set-Location -LiteralPath $appRoot
node server.mjs
