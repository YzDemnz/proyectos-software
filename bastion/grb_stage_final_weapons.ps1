Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='E:\GRB_ULTIMATE_MODPACK\STAGING'
$out=Join-Path $base 'MODLOADER_LAYOUT_NEXT'
$raw=Join-Path $base 'MOD_RAW_NEXT'
function CopyTree([string]$src,[string]$dst) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    Get-ChildItem -LiteralPath $src -File -Recurse | ForEach-Object {
        $rel=$_.FullName.Substring($src.Length+1)
        $target=Join-Path $dst $rel
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target
    }
}
$avs=Join-Path $raw 'AVS'
New-Item -ItemType Directory -Path $avs -Force | Out-Null
& tar -xf (Join-Path $base 'Crye_AVS_Loaded_V3.rar') -C $avs
if($LASTEXITCODE -ne 0){throw 'AVS extraction failed'}
CopyTree (Join-Path $avs 'Crye AVS - Loaded V3\Main') (Join-Path $out '15 Crye AVS Loaded\DataPC_patch_01\23_-_TEAMMATE_Template')
CopyTree (Join-Path $avs 'Crye AVS - Loaded V3\Resources') (Join-Path $out '15 Crye AVS Loaded\DataPC_Resources_patch_01')
$mcx=Join-Path $raw 'MCX'
New-Item -ItemType Directory -Path $mcx -Force | Out-Null
& tar -xf (Join-Path $base 'MCX_Raptor_v5.zip') -C $mcx
if($LASTEXITCODE -ne 0){throw 'MCX extraction failed'}
$root=Join-Path $mcx 'Raptor v4'
foreach($forge in @('DataPC_extra_patch_01','DataPC_patch_01','DataPC_Resources_patch_01')){
    CopyTree (Join-Path $root "$forge.forge") (Join-Path $out "16 MCX Raptor\$forge")
}
$all=@(Get-ChildItem -LiteralPath (Join-Path $base 'MODLOADER_LAYOUT_INACTIVE'),$out -File -Recurse | ForEach-Object {
    $rel=$_.FullName -replace '^.*?MODLOADER_LAYOUT_(?:INACTIVE|NEXT)\\[^\\]+\\',''
    [pscustomobject]@{Mod=$_.FullName -replace '^.*?MODLOADER_LAYOUT_(?:INACTIVE|NEXT)\\([^\\]+)\\.*$','$1';Relative=$rel;Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
$collisions=@($all|Group-Object Relative|Where-Object Count -gt 1)
if($collisions.Count){$collisions|ForEach-Object{Write-Output "COLLISION $($_.Name): $($_.Group.Mod -join ', ')"};throw 'Overlay collisions'}
$all|Export-Csv -LiteralPath 'E:\GRB_ULTIMATE_MODPACK\24_COMBINED_OVERLAY_INVENTORY.csv' -NoTypeInformation -Encoding UTF8
[pscustomobject]@{Mods=@($all.Mod|Sort-Object -Unique).Count;Files=$all.Count;Status='STAGED_NO_PATH_COLLISIONS'}
