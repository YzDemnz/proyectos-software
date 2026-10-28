Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$game='E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$pack='E:\GRB_ULTIMATE_MODPACK'
$source=Join-Path $pack 'STAGING\MODLOADER_LAYOUT_NEXT'
$target=Join-Path $game 'mods'
$inventory=Join-Path $pack '24_COMBINED_OVERLAY_INVENTORY.csv'
$manifest=Join-Path $pack '25_ADDITIONAL_INSTALL_MANIFEST.csv'
if(Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue){throw 'El juego sigue abierto'}
if(Test-Path -LiteralPath $manifest){throw 'Ya existe manifiesto de instalacion adicional'}
$rows=@(Import-Csv -LiteralPath $inventory | Where-Object {$_.Path.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)})
if($rows.Count -lt 60){throw "Inventario incompleto: $($rows.Count)"}
$planned=@(foreach($row in $rows){
    $relative=$row.Path.Substring($source.Length+1)
    $dest=Join-Path $target $relative
    if(Test-Path -LiteralPath $dest){throw "Destino ya existe: $dest"}
    if((Get-FileHash -LiteralPath $row.Path -Algorithm SHA256).Hash -ne $row.SHA256){throw "Staging corrupto: $($row.Path)"}
    [pscustomobject]@{Source=$row.Path;Target=$dest;Bytes=$row.Bytes;SHA256=$row.SHA256;Status='PLANNED'}
})
$planned|Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
foreach($folder in (Get-ChildItem -LiteralPath $source -Directory)){
    Copy-Item -LiteralPath $folder.FullName -Destination $target -Recurse
}
foreach($row in $planned){
    if((Get-FileHash -LiteralPath $row.Target -Algorithm SHA256).Hash -ne $row.SHA256){throw "Copia corrupta: $($row.Target)"}
    $row.Status='COPIED_HASH_VERIFIED'
}
$planned|Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
[pscustomobject]@{AdditionalMods=@(Get-ChildItem -LiteralPath $source -Directory).Count;AdditionalFiles=$planned.Count;TotalMods=@(Get-ChildItem -LiteralPath $target -Directory).Count;Status='INSTALLED_RUNTIME_PENDING'}
