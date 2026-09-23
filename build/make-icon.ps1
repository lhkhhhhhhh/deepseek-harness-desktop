# Regenerates build/icon.ico and build/icon.png from build/IconPainter.cs.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon.ps1
#
# The icons are committed, so this only matters when the artwork changes. The
# painter compiles against GDI+ (System.Drawing); that works on Windows
# PowerShell 5.1, while PowerShell 7 needs an assembly split introduced with
# .NET 10 that is not always present on a build machine. This wrapper therefore
# hands the work to Windows PowerShell 5.1 when it runs under pwsh, and keeps the
# committed icons (rather than failing the build) when no host can compile.
$ErrorActionPreference = 'Stop'

$ico = Join-Path $PSScriptRoot 'icon.ico'
$png = Join-Path $PSScriptRoot 'icon.png'
$core = Join-Path $PSScriptRoot 'make-icon-core.ps1'

function Test-IconPresent {
  return (Test-Path $ico) -and (Test-Path $png)
}

if ($PSVersionTable.PSEdition -ne 'Core') {
  & $core
  exit $LASTEXITCODE
}

# PowerShell 7: try the .NET Framework host, which is what the painter targets.
$legacy = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path $legacy) {
  Write-Host 'make-icon: handing the work to Windows PowerShell 5.1'
  & $legacy -NoProfile -ExecutionPolicy Bypass -File $core
  if ($LASTEXITCODE -eq 0) { exit 0 }
  Write-Warning "make-icon: Windows PowerShell 5.1 could not compile the painter (exit $LASTEXITCODE)"
}
else {
  Write-Warning 'make-icon: Windows PowerShell 5.1 is not available on this machine'
}

if (Test-IconPresent) {
  Write-Host 'make-icon: keeping the committed icons (build/icon.ico, build/icon.png)'
  exit 0
}

throw 'make-icon: no host could compile the painter and no committed icon exists; run this on Windows PowerShell 5.1'
