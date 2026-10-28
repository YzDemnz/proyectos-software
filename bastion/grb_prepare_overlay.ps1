Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = 'E:\GRB_ULTIMATE_MODPACK\STAGING'
$raw = Join-Path $base 'MOD_RAW'
$out = Join-Path $base 'MODLOADER_LAYOUT_INACTIVE'
if (Test-Path -LiteralPath $out) { throw 'Overlay staging ya existe; no se sobreescribe.' }
New-Item -ItemType Directory -Path $raw,$out -Force | Out-Null

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

$fear = Extract 'Fear_the_Radio_1.0.zip' 'Fear'
$f = Join-Path $fear 'Fear the Radio - Release'
CopyLoose (Join-Path $f 'DBContainer') (Join-Path $out '01 Fear the Radio\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')
CopyLoose (Join-Path $f 'Bootstrap_Split_Patch_01\TGT_WorldMap') (Join-Path $out '01 Fear the Radio\DataPC_TGT_WorldMap_Bootstrap_Split_patch_01\0_-_TGT_WorldMap')

$thank = Extract 'Thank_the_Radio_1.1.zip' 'Thank'
CopyLoose (Join-Path $thank 'Thank the Radio') (Join-Path $out '02 Thank the Radio\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')

$silencer = Extract 'No_Silencer_Debuff_1.1.zip' 'Silencer'
CopyLoose (Join-Path $silencer 'No silencer debuff 1.1\dbcontainer') (Join-Path $out '03 No Silencer Debuff\DataPC_patch_01\1_-_DBContainerEntry_0X104634F921')

$reticles = Extract 'Realistic_Reticles_2.0.zip' 'Reticles'
CopyLoose (Join-Path $reticles 'Extracted\DataPC_Resources.forge') (Join-Path $out '04 Realistic Reticles\DataPC_Resources')
CopyLoose (Join-Path $reticles 'Extracted\DataPC_Resources_patch_01.forge') (Join-Path $out '04 Realistic Reticles\DataPC_Resources_patch_01')

$inventory = Get-ChildItem -LiteralPath $out -File -Recurse | ForEach-Object {
    [pscustomobject]@{Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
}
$inventory | Export-Csv -LiteralPath 'E:\GRB_ULTIMATE_MODPACK\22_INACTIVE_OVERLAY_INVENTORY.csv' -NoTypeInformation -Encoding UTF8
$inventory.Count
