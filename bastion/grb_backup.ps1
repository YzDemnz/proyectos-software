$ErrorActionPreference = 'Stop'
$game = 'E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$backup = 'E:\GRB_MODPACK_BACKUP'
$manifestPath = Join-Path $backup '04_RESTORE_INFO\BACKUP_MANIFEST.csv'
if (Test-Path -LiteralPath $manifestPath) { throw 'El manifiesto de backup ya existe; no se sobreescribe.' }
$targets = @(
  @{Relative='sounddata\pc\soundspc_sfx.pck'; Section='00_VANILLA_ORIGINALS'},
  @{Relative='sounddata\pc\soundspc_sfx_wea_.pck'; Section='00_VANILLA_ORIGINALS'},
  @{Relative='DataPC_patch_01.forge'; Section='02_FORGE_BACKUPS'},
  @{Relative='DataPC_Resources_patch_01.forge'; Section='02_FORGE_BACKUPS'},
  @{Relative='DataPC_extra_patch_01.forge'; Section='02_FORGE_BACKUPS'},
  @{Relative='DataPC_TGT_WorldMap_Bootstrap_Split_patch_01.forge'; Section='02_FORGE_BACKUPS'}
)
$rows = foreach ($target in $targets) {
  $source = Join-Path $game $target.Relative
  $dest = Join-Path (Join-Path $backup $target.Section) $target.Relative
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Falta origen: $source" }
  if (Test-Path -LiteralPath $dest) { throw "Backup ya existe: $dest" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
  $before = Get-FileHash -LiteralPath $source -Algorithm SHA256
  Copy-Item -LiteralPath $source -Destination $dest -ErrorAction Stop
  $after = Get-FileHash -LiteralPath $dest -Algorithm SHA256
  if ($before.Hash -ne $after.Hash) { throw "Hash de backup distinto: $dest" }
  [pscustomobject]@{Source=$source;Backup=$dest;Bytes=(Get-Item -LiteralPath $source).Length;OriginalSHA256=$before.Hash;BackupSHA256=$after.Hash;VerifiedUtc=(Get-Date).ToUniversalTime().ToString('o')}
}
$rows | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8
$rows | Format-Table -AutoSize
