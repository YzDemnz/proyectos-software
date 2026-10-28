Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = 'E:\GRB_ULTIMATE_MODPACK\STAGING'
$raw = Join-Path $base 'MOD_RAW_NEXT'
$out = Join-Path $base 'MODLOADER_LAYOUT_NEXT'
if (Test-Path -LiteralPath $out) { throw 'Ya existe staging NEXT.' }
New-Item -ItemType Directory -Path $raw,$out -Force | Out-Null
function Extract([string]$archive,[string]$folder) {
    $dest=Join-Path $raw $folder
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    & tar -xf (Join-Path $base $archive) -C $dest
    if ($LASTEXITCODE -ne 0) { throw "Error extrayendo $archive" }
    return $dest
}
function CopyTree([string]$source,[string]$dest) {
    if (-not (Test-Path -LiteralPath $source)) { throw "Falta $source" }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {
        $relative=$_.FullName.Substring($source.Length+1)
        $target=Join-Path $dest $relative
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target
    }
}
$mp=Extract 'Smith_Wesson_MP20_1.3.zip' 'MP20'
$mpRoot=Join-Path $mp 'SMITH AND WESSON MP 20\MP20'
foreach($forge in @('DataPC_extra_patch_01','DataPC_patch_01','DataPC_Resources_patch_01')) { CopyTree (Join-Path $mpRoot $forge) (Join-Path $out "09 S&W MP20\$forge") }
$names=Extract 'Real_Weapon_Names_2.0.zip' 'NAMES'
CopyTree (Join-Path $names 'Real weapon names 2.0\Base\DataPC_patch_01.forge') (Join-Path $out '10 Real Weapon Names\DataPC_patch_01')
$wrap=Extract 'Elite_Iron_Suppressor_Wrap_Prism_1.1.zip' 'WRAP'
CopyTree (Join-Path $wrap 'Elite Iron Suppressor Wrap_Prism\DataPC_Resources_patch_01.forge') (Join-Path $out '11 Suppressor Wrap\DataPC_Resources_patch_01')
$m2=Extract 'Ma_Deuce_Fix_1.1.zip' 'M2'
$m2Root=Join-Path $m2 'Ma Deuce FIX'
CopyTree (Join-Path $m2Root 'DB_Container') (Join-Path $out '12 Ma Deuce\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')
CopyTree (Join-Path $m2Root 'Patch_01') (Join-Path $out '12 Ma Deuce\DataPC_patch_01')
CopyTree (Join-Path $m2Root 'Resources') (Join-Path $out '12 Ma Deuce\DataPC_Resources_patch_01')
$peltor=Extract 'Peltor_Comtacs_IV_v2.download' 'PELTOR'
$peltorRoot=Join-Path $peltor 'peltor comtacs IV\replaces peltor litecom'
CopyTree (Join-Path $peltorRoot 'resources patch 01') (Join-Path $out '13 Peltor Comtacs IV\DataPC_Resources_patch_01')
CopyTree (Join-Path $peltorRoot 'teammate') (Join-Path $out '13 Peltor Comtacs IV\DataPC_patch_01\23_-_TEAMMATE_Template')
$bison=Extract 'Acosta_Bison_Belt_1.7z' 'BISON'
$bisonRoot=Join-Path $bison 'ACOSTA_FC_Bison_Battlebelt-Release\Main Files'
CopyTree (Join-Path $bisonRoot '23_-_TEAMMATE_Template.data') (Join-Path $out '14 Acosta Bison Belt\DataPC_patch_01\23_-_TEAMMATE_Template')
CopyTree (Join-Path $bisonRoot 'DataPC_Resources_patch_01.forge') (Join-Path $out '14 Acosta Bison Belt\DataPC_Resources_patch_01')
$all=@(Get-ChildItem -LiteralPath (Join-Path $base 'MODLOADER_LAYOUT_INACTIVE'),$out -File -Recurse | ForEach-Object {
    $rel=$_.FullName -replace '^.*?MODLOADER_LAYOUT_(?:INACTIVE|NEXT)\\[^\\]+\\',''
    [pscustomobject]@{Mod=$_.FullName -replace '^.*?MODLOADER_LAYOUT_(?:INACTIVE|NEXT)\\([^\\]+)\\.*$','$1';Relative=$rel;Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
$collisions=@($all | Group-Object Relative | Where-Object Count -gt 1)
if($collisions.Count){$collisions | ForEach-Object {Write-Output "COLLISION $($_.Name): $($_.Group.Mod -join ', ')"};throw 'Colisiones en overlay.'}
$all | Export-Csv -LiteralPath 'E:\GRB_ULTIMATE_MODPACK\24_COMBINED_OVERLAY_INVENTORY.csv' -NoTypeInformation -Encoding UTF8
[pscustomobject]@{Mods=@($all.Mod|Sort-Object -Unique).Count;Files=$all.Count;Status='STAGED_NO_PATH_COLLISIONS'}
