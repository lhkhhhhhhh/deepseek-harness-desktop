# Makes electron-builder's Windows tooling work on an unprivileged account.
#
# Run automatically by `npm install` (see the postinstall script). It replaces
# electron-builder's bundled 7za.exe with a small shim that tolerates the two
# macOS symlinks inside the winCodeSign archive; without it, packaging aborts on
# a stock Windows account that has neither developer mode nor an elevated shell.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/prepare-builder-tools.ps1
#
# Nothing here touches the application being packaged.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sevenZipDir = Join-Path $root 'node_modules\7zip-bin\win\x64'
$real = Join-Path $sevenZipDir '7za-real.exe'
$shim = Join-Path $sevenZipDir '7za.exe'
$shimSource = Join-Path $PSScriptRoot 'SevenZipShim.cs'

if (-not (Test-Path $sevenZipDir)) {
  Write-Host 'prepare-builder-tools: 7zip-bin is not installed yet, skipping'
  exit 0
}

if ((Test-Path $real) -and (Test-Path $shim)) {
  Write-Host 'prepare-builder-tools: 7za shim already installed'
  exit 0
}

if (-not (Test-Path $real)) {
  Copy-Item $shim $real -Force
  Write-Host 'prepare-builder-tools: kept the original 7za.exe as 7za-real.exe'
}

Remove-Item $shim -Force -ErrorAction SilentlyContinue
Add-Type -Path $shimSource -OutputAssembly $shim -OutputType ConsoleApplication

if (-not (Test-Path $shim)) { throw 'failed to build the 7za shim' }
Write-Host 'prepare-builder-tools: 7za shim installed'
