Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$game='E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$mods=Join-Path $game 'mods'
$pack='E:\GRB_ULTIMATE_MODPACK'
$ini=Join-Path $game 'GRB_Tweaks.ini'
$iniBackup='E:\GRB_MODPACK_BACKUP\03_CONFIG_BACKUPS\GRB_Tweaks_before_overlay.ini'
if(Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue){throw 'Cierra el juego antes de restaurar'}
foreach($manifest in @('23_OVERLAY_INSTALL_MANIFEST.csv','25_ADDITIONAL_INSTALL_MANIFEST.csv')){
    $path=Join-Path $pack $manifest
    if(-not(Test-Path -LiteralPath $path)){continue}
    foreach($row in (Import-Csv -LiteralPath $path)){
        if($row.Status -eq 'DISABLED_AFTER_RUNTIME_WARNING'){continue}
        if(-not $row.Target.StartsWith($mods+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Ruta fuera de mods: $($row.Target)"}
        if(-not(Test-Path -LiteralPath $row.Target)){continue}
        if((Get-FileHash -LiteralPath $row.Target -Algorithm SHA256).Hash -ne $row.SHA256){throw "Archivo modificado desde instalacion: $($row.Target)"}
        Remove-Item -LiteralPath $row.Target
    }
}
if(Test-Path -LiteralPath $mods){
    $cache=Join-Path $mods '.cache'
    if(Test-Path -LiteralPath $cache){
        $resolved=(Resolve-Path -LiteralPath $cache).Path
        if(-not $resolved.StartsWith($mods+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Cache fuera de mods'}
        Remove-Item -LiteralPath $cache -Recurse -Force
    }
    Get-ChildItem -LiteralPath $mods -Directory -Recurse | Sort-Object FullName -Descending | ForEach-Object {
        if(-not @(Get-ChildItem -LiteralPath $_.FullName -Force).Count){Remove-Item -LiteralPath $_.FullName}
    }
    if(-not @(Get-ChildItem -LiteralPath $mods -Force).Count){Remove-Item -LiteralPath $mods}
}
if(-not(Test-Path -LiteralPath $iniBackup)){throw 'Falta respaldo INI'}
Copy-Item -LiteralPath $iniBackup -Destination $ini -Force
if((Get-FileHash -LiteralPath $ini -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $iniBackup -Algorithm SHA256).Hash){throw 'Restauracion INI fallo'}
'Overlay restaurado; audio y loader tienen scripts separados.'
