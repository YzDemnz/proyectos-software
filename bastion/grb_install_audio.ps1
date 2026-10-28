Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$game = 'E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$pack = 'E:\GRB_ULTIMATE_MODPACK'
$backupManifest = 'E:\GRB_MODPACK_BACKUP\04_RESTORE_INFO\BACKUP_MANIFEST.csv'
$installManifest = Join-Path $pack '21_INSTALL_MANIFEST.csv'
$extract = Join-Path $pack 'STAGING\AWO_EXTRACTED'
$items = @(
    @{ Archive = 'AWO_Main_Sound_Effects_0.26.0.7z'; Name = 'soundspc_sfx.pck'; Mod = 'AWO Main Sound Effects 0.26.0' },
    @{ Archive = 'AWO_Weapon_Sound_Pack_0.26.0.7z'; Name = 'soundspc_sfx_wea_.pck'; Mod = 'AWO Weapon Sound Pack 0.26.0' }
)

if (Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue) { throw 'El juego esta en ejecucion.' }
if (Test-Path -LiteralPath $installManifest) { throw 'Ya existe manifiesto de instalacion. No se repite.' }
if (-not (Test-Path -LiteralPath $backupManifest)) { throw 'Falta manifiesto de backup.' }
$backups = Import-Csv -LiteralPath $backupManifest
New-Item -ItemType Directory -Path $extract -Force | Out-Null
$planned = @()
foreach ($item in $items) {
    $archive = Join-Path (Join-Path $pack 'STAGING') $item.Archive
    $folder = Join-Path $extract $item.Name
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    & tar -xf $archive -C $folder
    if ($LASTEXITCODE -ne 0) { throw "No se extrajo $archive" }
    $source = Join-Path $folder $item.Name
    $target = Join-Path (Join-Path $game 'sounddata\pc') $item.Name
    if (-not (Test-Path -LiteralPath $source)) { throw "Falta $source" }
    $entry = @($backups | Where-Object Source -EQ $target)
    if ($entry.Count -ne 1) { throw "Backup no verificado para $target" }
    $currentHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($currentHash -ne $entry[0].OriginalSHA256) { throw "Original cambiado desde backup: $target" }
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $planned += [pscustomobject]@{ Mod = $item.Mod; Source = $source; Target = $target; Backup = $entry[0].Backup; OriginalSHA256 = $currentHash; ModSHA256 = $sourceHash; Status = 'PLANNED'; VerifiedUtc = '' }
}

$planned | Export-Csv -LiteralPath $installManifest -NoTypeInformation -Encoding UTF8
foreach ($entry in $planned) {
    Copy-Item -LiteralPath $entry.Source -Destination $entry.Target -Force
    $installedHash = (Get-FileHash -LiteralPath $entry.Target -Algorithm SHA256).Hash
    if ($installedHash -ne $entry.ModSHA256) { throw "Copia no coincide: $($entry.Target)" }
    $entry.Status = 'INSTALLED_HASH_VERIFIED'
    $entry.VerifiedUtc = (Get-Date).ToUniversalTime().ToString('o')
    $planned | Export-Csv -LiteralPath $installManifest -NoTypeInformation -Encoding UTF8
}
$planned | Select-Object Mod,Target,Status,ModSHA256
