Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$game = 'E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$pack = 'E:\GRB_ULTIMATE_MODPACK'
$source = Join-Path $pack 'STAGING\MODLOADER_LAYOUT_INACTIVE'
$target = Join-Path $game 'mods'
$inventoryPath = Join-Path $pack '22_INACTIVE_OVERLAY_INVENTORY.csv'
$overlayManifest = Join-Path $pack '23_OVERLAY_INSTALL_MANIFEST.csv'
$ini = Join-Path $game 'GRB_Tweaks.ini'
$iniBackup = 'E:\GRB_MODPACK_BACKUP\03_CONFIG_BACKUPS\GRB_Tweaks_before_overlay.ini'

if (Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue) { throw 'El juego sigue abierto.' }
if (Test-Path -LiteralPath $target) { throw 'Ya existe carpeta mods; no sobreescribir.' }
if (Test-Path -LiteralPath $overlayManifest) { throw 'Ya existe manifiesto overlay; no repetir.' }
if (Test-Path -LiteralPath $iniBackup) { throw 'Ya existe backup del INI; no sobreescribir.' }
$inventory = @(Import-Csv -LiteralPath $inventoryPath)
if ($inventory.Count -ne 244) { throw "Inventario inesperado: $($inventory.Count)" }
$planned = foreach ($entry in $inventory) {
    if (-not $entry.Path.StartsWith($source + '\',[StringComparison]::OrdinalIgnoreCase)) { throw "Ruta fuera del staging: $($entry.Path)" }
    $relative = $entry.Path.Substring($source.Length + 1)
    [pscustomobject]@{Source=$entry.Path;Target=(Join-Path $target $relative);Bytes=$entry.Bytes;SHA256=$entry.SHA256;Status='PLANNED'}
}
$planned | Export-Csv -LiteralPath $overlayManifest -NoTypeInformation -Encoding UTF8

Copy-Item -LiteralPath $ini -Destination $iniBackup
$iniHash = (Get-FileHash -LiteralPath $ini -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $iniBackup -Algorithm SHA256).Hash -ne $iniHash) { throw 'Backup de INI no coincide.' }

New-Item -ItemType Directory -Path $target | Out-Null
foreach ($folder in (Get-ChildItem -LiteralPath $source -Directory)) {
    Copy-Item -LiteralPath $folder.FullName -Destination $target -Recurse
}
foreach ($entry in $planned) {
    if ((Get-FileHash -LiteralPath $entry.Target -Algorithm SHA256).Hash -ne $entry.SHA256) { throw "Copia overlay no coincide: $($entry.Target)" }
    $entry.Status = 'COPIED_HASH_VERIFIED'
}
$planned | Export-Csv -LiteralPath $overlayManifest -NoTypeInformation -Encoding UTF8

$changes = @{
    'enemies.enabled'='1'; 'enemies.detection_range'='1.3500'; 'enemies.detection_speed'='1.2500'; 'enemies.engagement_distance'='1.4000';
    'enemies.vehicle_visibility'='1.1000'; 'enemies.vehicle_visibility_alerted'='1.1500';
    'weaponmult.enabled'='1'; 'weaponmult.damage'='1.4000'; 'weaponmult.range'='1.2000';
    'weaponmult.audio_subsonic'='1.1000'; 'weaponmult.audio_supersonic'='1.2500'; 'weaponmult.pickup'='0.8500';
    'healthregen.enabled'='1'; 'healthregen.delay'='1.5000'; 'healthregen.regen'='0.7000';
    'autoreload.enabled'='1'; 'menu.diagnostics'='1'; 'firstperson.enabled'='0'
}
$seen = @{}
$section = ''
$lines = foreach ($line in (Get-Content -LiteralPath $iniBackup)) {
    if ($line -match '^\[([^]]+)\]$') { $section = $Matches[1]; $line; continue }
    if ($line -match '^([a-zA-Z0-9_]+)\s*=') {
        $key = $section + '.' + $Matches[1]
        if ($changes.ContainsKey($key)) { $seen[$key] = $true; "$($Matches[1]) = $($changes[$key])"; continue }
    }
    $line
}
foreach ($key in $changes.Keys) { if (-not $seen.ContainsKey($key)) { throw "Falta clave INI: $key" } }
$lines += ''
$lines += '[forgemod]'
$lines += 'enabled = 1'
$lines += 'compress = 1'
$lines += 'dry_run = 0'
$lines += 'grow = 1'
$lines | Set-Content -LiteralPath $ini -Encoding UTF8
if ((Get-Content -LiteralPath $ini -Raw) -notmatch '(?ms)^\[forgemod\]\r?\nenabled = 1\r?\ncompress = 1\r?\ndry_run = 0\r?\ngrow = 1') { throw 'No se guardo forgemod.' }

[pscustomobject]@{OverlayFiles=$planned.Count;Mods=(Get-ChildItem -LiteralPath $target -Directory).Count;IniBackup=$iniBackup;IniOriginalSHA256=$iniHash;Status='COPIED_AND_CONFIGURED_RUNTIME_PENDING'}
