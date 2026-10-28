[CmdletBinding()]
param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$blender = Join-Path $root 'Runtime\blender-4.5.14-windows-x64\blender.exe'
$project = Join-Path $root 'Mods\EnfusionBridgeTest\EnfusionBridgeTest.gproj'
$scene = Join-Path $PSScriptRoot 'Bridge_HeadTurn.blend'
$bootstrap = Join-Path $PSScriptRoot 'Scripts\enable_enfusion45.py'
$workbench = 'E:\Carpetas Varias\Stem\steamapps\common\Arma Reforger Tools\Workbench\ArmaReforgerWorkbenchSteamDiag.exe'
$addons = 'C:\SteamLibrary\steamapps\common\Arma Reforger\addons'
foreach ($path in @($blender, $project, $scene, $bootstrap, $workbench, $addons)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required path not found: $path" }
}
$processes = @(Get-CimInstance Win32_Process)
$wb = @($processes | Where-Object {
    $_.ExecutablePath -eq $workbench -and $_.CommandLine.Contains($project)
})
$blend = @($processes | Where-Object { $_.ExecutablePath -eq $blender })
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
foreach ($pair in @(@(5775, $wb), @(9876, $blend))) {
    $listener = @($listeners | Where-Object LocalPort -eq $pair[0])
    $allowed = @($pair[1] | ForEach-Object ProcessId)
    if ($listener | Where-Object { $_.OwningProcess -notin $allowed }) {
        throw "Port $($pair[0]) belongs to another process (owners: $($listener.OwningProcess -join ','); expected: $($allowed -join ','); project: $project). No process was stopped."
    }
}
if ($CheckOnly) {
    [pscustomobject]@{ PathsValid = $true; WorkbenchRunning = ($wb.Count -gt 0); BlenderRunning = ($blend.Count -gt 0) }
    return
}
if (-not $wb.Count) {
    $arguments = '-gproj "{0}" -addonsDir "{1}" -profile "{2}"' -f $project, $addons, (Join-Path $PSScriptRoot 'WorkbenchProfile')
    Start-Process -FilePath $workbench -WorkingDirectory (Split-Path $workbench) -ArgumentList $arguments -WindowStyle Normal
}
if (-not $blend.Count) {
    $oldConfig = $env:BLENDER_USER_CONFIG
    $oldScripts = $env:BLENDER_USER_SCRIPTS
    try {
        $env:BLENDER_USER_CONFIG = Join-Path $root 'Runtime\BlenderUser45\config'
        $env:BLENDER_USER_SCRIPTS = Join-Path $root 'Runtime\BlenderUser45\scripts'
        Start-Process -FilePath $blender -WorkingDirectory (Split-Path $blender) -ArgumentList ('"{0}" --python "{1}"' -f $scene, $bootstrap) -WindowStyle Normal
    } finally {
        $env:BLENDER_USER_CONFIG = $oldConfig
        $env:BLENDER_USER_SCRIPTS = $oldScripts
    }
}
Write-Output 'Bridge tools started. Codex uses the configured blender MCP; EBT uses Workbench NET API on 5775.'
