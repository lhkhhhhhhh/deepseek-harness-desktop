# Assembles build/icon.ico and build/icon.png from build/IconPainter.cs.
#
# Implementation detail of make-icon.ps1: this half requires a host whose
# compiler can reference GDI+ (Windows PowerShell 5.1 on .NET Framework). Run
# make-icon.ps1 instead of this file unless you know the host qualifies.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon-core.ps1
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -eq 'Core') {
  throw 'make-icon-core.ps1 needs Windows PowerShell 5.1 (.NET Framework); run make-icon.ps1 instead.'
}

$ico = Join-Path $PSScriptRoot 'icon.ico'
$png = Join-Path $PSScriptRoot 'icon.png'
$source = Join-Path $PSScriptRoot 'IconPainter.cs'

Add-Type -AssemblyName System.Drawing
Add-Type -Path $source -ReferencedAssemblies System.Drawing

[DshIconPainter]::Save($ico, $png)

"icon.ico : {0:N1} KB" -f ((Get-Item $ico).Length / 1KB)
"icon.png : {0:N1} KB" -f ((Get-Item $png).Length / 1KB)
