Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = 'E:\GRB_ULTIMATE_MODPACK\STAGING'
$raw = Join-Path $base 'MOD_RAW'
$out = Join-Path $base 'MODLOADER_LAYOUT_INACTIVE'
if (-not (Test-Path -LiteralPath $out)) { throw 'Falta staging de overlay.' }
function Extract([string] $archive, [string] $folder) {
    $path = Join-Path $raw $folder
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    & tar -xf (Join-Path $base $archive) -C $path
    if ($LASTEXITCODE -ne 0) { throw "Error extrayendo $archive" }
    return $path
}
function CopyLoose([string] $source, [string] $destination) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $source -File | Copy-Item -Destination $destination
}

$hk = Extract 'Mackle_HK416_v4.download' 'HK416'
$h = Join-Path $hk "Mackle's HK416"
CopyLoose (Join-Path $h 'DataPC_patch_01') (Join-Path $out '05 Mackle HK416\DataPC_patch_01')
CopyLoose (Join-Path $h 'DataPC_Resources_patch_01') (Join-Path $out '05 Mackle HK416\DataPC_Resources_patch_01')
CopyLoose (Join-Path $h 'DataPC_patch_01\PUT IN DBCONTAINER') (Join-Path $out '05 Mackle HK416\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')
$fix = Extract 'Mackle_HK416_DB_Fix.rar' 'HK416_FIX'
CopyLoose (Join-Path $fix 'DataPC_patch_01\DB Container') (Join-Path $out '05 Mackle HK416\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')

$scar = Extract 'SCAR_L_2035_v1.download' 'SCAR_L'
$s = Join-Path $scar 'SCAR-L'
CopyLoose (Join-Path $s '1_-_DBContainerEntry_0X104634F921.data') (Join-Path $out '06 SCAR-L\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')
CopyLoose (Join-Path $s 'DataPC_patch_01.forge') (Join-Path $out '06 SCAR-L\DataPC_patch_01')
CopyLoose (Join-Path $s 'DataPC_Resources_patch_01.forge') (Join-Path $out '06 SCAR-L\DataPC_Resources_patch_01')
CopyLoose (Join-Path $s 'DataPC_extra_patch_01.forge') (Join-Path $out '06 SCAR-L\DataPC_extra_patch_01')

$inventory = Get-ChildItem -LiteralPath $out -File -Recurse | ForEach-Object {
    [pscustomobject]@{Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
}
$inventory | Export-Csv -LiteralPath 'E:\GRB_ULTIMATE_MODPACK\22_INACTIVE_OVERLAY_INVENTORY.csv' -NoTypeInformation -Encoding UTF8
$inventory.Count
