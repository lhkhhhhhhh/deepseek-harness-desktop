# Build the installers using China-friendly mirrors.
#
# electron-builder downloads its own tooling (winCodeSign, nsis) and Electron's
# zip from GitHub releases, which is slow or unreachable from some networks.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-mirrored.ps1
$ErrorActionPreference = 'Stop'

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

Write-Host "ELECTRON_MIRROR                  = $env:ELECTRON_MIRROR"
Write-Host "ELECTRON_BUILDER_BINARIES_MIRROR = $env:ELECTRON_BUILDER_BINARIES_MIRROR"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  & npm.cmd run dist
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
