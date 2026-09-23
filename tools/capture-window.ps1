# Capture an application window for manual verification.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/capture-window.ps1 `
#       -Out shot.png -Match 'DeepSeek Harness' -WaitSeconds 30
#
# Maximizes the window and writes a PNG screenshot next to the current directory.
param(
  [string]$Out = 'shot.png',
  [int]$WaitSeconds = 30,
  [string]$Match = 'DeepSeek Harness'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinShot {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$proc = $null
while ((Get-Date) -lt $deadline) {
  $proc = Get-Process |
    Where-Object { $_.MainWindowTitle -eq $Match -or ($_.ProcessName -like 'electron*' -and $_.MainWindowTitle -like "*$Match*") } |
    Select-Object -First 1
  if ($proc) { break }
  Start-Sleep -Milliseconds 800
}

if (-not $proc) {
  Write-Output 'WINDOW_NOT_FOUND'
  exit 1
}

Write-Output ("window: pid={0} title='{1}'" -f $proc.Id, $proc.MainWindowTitle)
[void][WinShot]::ShowWindow($proc.MainWindowHandle, 3)   # SW_MAXIMIZE
Start-Sleep -Milliseconds 300
[void][WinShot]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Seconds 4

$rect = New-Object WinShot+RECT
[void][WinShot]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
Write-Output ("bounds: {0},{1} {2}x{3}" -f $rect.Left, $rect.Top, $w, $h)
if ($w -le 0 -or $h -le 0) { Write-Output 'BAD_BOUNDS'; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$path = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved: {0} ({1:N0} bytes)" -f $path, (Get-Item $path).Length)
