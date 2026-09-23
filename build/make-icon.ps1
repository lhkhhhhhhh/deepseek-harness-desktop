# Generates build/icon.ico and build/icon.png for the DeepSeek Harness desktop client.
# The drawing itself lives in build/IconPainter.cs, compiled here so the script
# works under both Windows PowerShell 5.1 (.NET Framework) and PowerShell 7+
# (.NET, where System.Drawing.Common is a separate assembly).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon.ps1
#
# The generated icons are committed, so this only has to run when the artwork
# changes.
$ErrorActionPreference = 'Stop'

$ico = Join-Path $PSScriptRoot 'icon.ico'
$png = Join-Path $PSScriptRoot 'icon.png'
$source = Join-Path $PSScriptRoot 'IconPainter.cs'

if ($PSVersionTable.PSEdition -eq 'Core') {
  # PowerShell 7 / .NET 5+: System.Drawing lives in a package assembly.
  Add-Type -AssemblyName System.Drawing.Common
  Add-Type -Path $source -ReferencedAssemblies System.Drawing.Common
}
else {
  Add-Type -AssemblyName System.Drawing
  Add-Type -Path $source -ReferencedAssemblies System.Drawing
}

[DshIconPainter]::Save($ico, $png)

"icon.ico : {0:N1} KB" -f ((Get-Item $ico).Length / 1KB)
"icon.png : {0:N1} KB" -f ((Get-Item $png).Length / 1KB)
