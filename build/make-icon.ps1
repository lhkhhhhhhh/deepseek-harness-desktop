# Generates build/icon.ico and build/icon.png for the DeepSeek Harness desktop client.
# The drawing itself lives in build/IconPainter.cs, compiled here so the script
# works under both Windows PowerShell 5.1 and PowerShell 7+.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon.ps1
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'IconPainter.cs') -ReferencedAssemblies System.Drawing

$ico = Join-Path $PSScriptRoot 'icon.ico'
$png = Join-Path $PSScriptRoot 'icon.png'

[DshIconPainter]::Save($ico, $png)

"icon.ico : {0:N1} KB" -f ((Get-Item $ico).Length / 1KB)
"icon.png : {0:N1} KB" -f ((Get-Item $png).Length / 1KB)
