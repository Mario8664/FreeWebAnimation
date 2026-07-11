$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$PortableNode = Join-Path $Project 'tools\node\node.exe'
$Node = if (Test-Path $PortableNode) { $PortableNode } else { 'node' }

Push-Location $Project
try {
  & $Node 'scripts/export-video.mjs' @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
