Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$pack='E:\GRB_ULTIMATE_MODPACK'
$csv=Join-Path $pack '01_MODLIST.csv'
$rows=@(Import-Csv -LiteralPath $csv)
$names=@{
  'Thank the Radio'='02 Thank the Radio';
  'Remove Silencer Damage Debuff'='03 No Silencer Debuff'; 'Realistic Reticles'='04 Realistic Reticles';
  'Mackle HK416'='05 Mackle HK416'; 'SCAR-L HonorableAnnihilator'='06 SCAR-L';
  'No Visible Laser Light'='07 No Visible Laser Light'; 'Crye Precision G3'='08 Crye G3';
  'Smith and Wesson M&P 2.0'='09 S&W MP20'; 'Real Weapon Names'='10 Real Weapon Names';
  'Elite Iron Suppressor Wrap'='11 Suppressor Wrap'; 'Ma Deuce n Some / M2 Browning'='12 Ma Deuce';
  'Peltor Comtacs IV'='13 Peltor Comtacs IV'; 'Acosta Bison Belt'='14 Acosta Bison Belt';
  'Crye AVS Loaded'='15 Crye AVS Loaded'; 'MCX Raptor'='16 MCX Raptor'
}
foreach($r in $rows){
    if($names.ContainsKey($r.Name)){
        $r.Installed='YES'
        $r.Status='INSTALLED_HASH_VERIFIED; VULKAN TEST IN PROGRESS'
        $r.InstallMethod="Priler Forge ModLoader: mods/$($names[$r.Name])"
        $r.Notes='Instalado desde archivo oficial descargado; rutas del overlay y SHA256 cotejados. Prueba de arranque Vulkan final en curso.'
    }
}
foreach($r in $rows){
    switch($r.Name){
      'Priler GRB Tweaks'{$r.Installed='YES';$r.Status='ACTIVE; VULKAN TEST IN PROGRESS';$r.Notes='dinput8.dll y Forge ModLoader activos; valores tacticos moderados; firstperson.enabled=0.'}
      'Authentic Warfare Overhaul'{$r.Installed='YES - TWO AUDIO MODULES';$r.Status='INSTALLED_HASH_VERIFIED; VULKAN TEST IN PROGRESS';$r.Notes='Main Sound Effects y Weapon Sound Pack instalados; respaldos de los dos PCK originales.'}
      'MCX Raptor'{$r.Version='5 (archive interior Raptor v4)';$r.Replaces='Omen Tactical'}
      'Smith and Wesson M&P 2.0'{$r.Version='1.3';$r.Replaces='P45T/FNP45'}
      'Crye AVS Loaded'{$r.Version='3'}
      'Peltor Comtacs IV'{$r.Version='2';$r.Replaces='Peltor Litecom (solo esta variante)'}
      'Elite Iron Suppressor Wrap'{$r.Version='1.1'}
      'Real Weapon Names'{$r.Version='2.0';$r.Notes='Solo Base instalado; texturas opcionales omitidas para evitar conflictos.'}
      'Fear the Radio'{$r.Installed='NO';$r.Status='DISABLED AFTER VULKAN LOADER WARNING';$r.Notes='WorldMap crecio 25655716 -> 25680857 bytes; Priler advierte game expected to fault. Movido a staging desactivado.'}
      'Ghost Recon Breakpoint Photorealistic Graphics'{$r.Status='PRESET DOWNLOADED; NOT INSTALLED';$r.Notes='Preset RAR descargado; ReShade Vulkan no instalado por falta de prueba de compatibilidad con Priler.'}
      'Faust Climate Overhaul'{$r.Status='SKIPPED - OLD WIP AND CRASH REPORT';$r.Notes='Version 0.1 antigua y reporte de cierre reciente; priorizada estabilidad.'}
      'MercerBlacks Improved Sling Positions'{$r.Status='DOWNLOADED; NOT INSTALLED';$r.Notes='Muchas variantes por mochila; elegir una requiere comprobar equipamiento concreto y conflictos con Crye AVS.'}
      'NPC Modern Loadouts'{$r.Status='DOWNLOADED; NOT INSTALLED - PREPATCH DEPENDENCY';$r.Notes='Nexus declara dependencia Pre September 20th patch Forge y variantes mutuamente excluyentes.'}
      'Choose Your Loadout / Vanilla Loadout Remover'{$r.Status='NOT INSTALLED - GLOBAL LOADOUT CONFLICT RISK';$r.Notes='Cambia loadouts globales que pueden solaparse con los BuildTables instalados; evitado hasta validar combinacion.'}
      'Shadow Company'{$r.Status='NOT INSTALLED - FACTION OVERLAP RISK';$r.Notes='Overhaul de faccion pendiente de integracion y prueba con mods de equipamiento.'}
      'Breach and Clear'{$r.Status='NOT INSTALLED - MULTIPLE FACTION/GEAR VARIANTS';$r.Notes='Tiene variantes modulares y paquetes de facciones; no se mezclo sin seleccion exacta.'}
      'Noveske Shawty'{$r.Status='SKIPPED - AUTHOR NOTES GUNSMITH ISSUES';$r.Notes='Descripcion advierte problemas de alineacion y ausencia de miras de hierro.'}
      'Ops-Core AMP Pack'{$r.Status='NOT INSTALLED - REQUIRES INDIVIDUAL BUILDTABLES';$r.Notes='Dependencia individual asociada a paquete combinado Unlock Everything; no se instalo paquete que incluye premium.'}
    }
}
$rows|Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
$download=@(Get-ChildItem -LiteralPath (Join-Path $pack 'STAGING') -File | Where-Object {$_.Length -gt 0} | ForEach-Object {
    $installed=if($_.Name -match 'AWO_Main|AWO_Weapon|GRB_Tweaks|Thank_the_Radio|No_Silencer|Realistic_Reticles|Mackle_HK416|SCAR_L|No_Visible_Laser|Crye_G3|Smith_Wesson|Real_Weapon_Names|Elite_Iron|Ma_Deuce|Peltor_Comtacs|Acosta_Bison|Crye_AVS|MCX_Raptor'){'INSTALLED COMPONENT'}else{'STAGED ONLY'}
    [pscustomobject]@{Name=$_.BaseName;Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash;Status=$installed}
})
$download|Export-Csv -LiteralPath (Join-Path $pack '20_DOWNLOAD_MANIFEST.csv') -NoTypeInformation -Encoding UTF8
$overlay=@(@(Import-Csv -LiteralPath (Join-Path $pack '23_OVERLAY_INSTALL_MANIFEST.csv'))+@(Import-Csv -LiteralPath (Join-Path $pack '25_ADDITIONAL_INSTALL_MANIFEST.csv'))|Where-Object Status -eq 'COPIED_HASH_VERIFIED')
$readme=@(
 'GHOST RECON BREAKPOINT - ULTIMATE TACTICAL MODPACK',
 'Estado: 15 mods Forge activos + Priler GRB Tweaks + 2 modulos de Authentic Warfare Overhaul = 18 componentes efectivos.',
 'Instalacion: E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint',
 'Lanzamiento: GRB_vulkan.exe. Tercera persona; firstperson.enabled=0. Sin Vortex.',
 "Overlay: $($overlay.Count) archivos activos y verificados SHA256; 15 carpetas de mods, mas .cache generada por Priler. Fear the Radio desactivado tras advertencia explicita de fallo.",
 'Audio: soundspc_sfx.pck y soundspc_sfx_wea_.pck instalados desde AWO 0.26.0.',
 'Tactico: deteccion, velocidad y distancia de combate enemigos elevadas; dano/rango armas moderadamente elevados; regeneracion reducida. No se alteran saves ni flags de campana.',
 'Backup maestro: E:\GRB_MODPACK_BACKUP. Seis originales y configuracion INI resguardados antes de cambios.',
 'Restauracion: grb_restore_overlay.ps1; grb_restore_loader.ps1; grb_restore_audio.ps1 en el workspace. Ejecutar solo con el juego cerrado.',
 'Inventarios: 01_MODLIST.csv, 20_DOWNLOAD_MANIFEST.csv, 23_OVERLAY_INSTALL_MANIFEST.csv, 24_COMBINED_OVERLAY_INVENTORY.csv, 25_ADDITIONAL_INSTALL_MANIFEST.csv.',
 'Prueba Vulkan final: consultar 10_RUNTIME_TESTS.txt. Una primera presentacion no verifica campana, audio audible, armas/equipo en partida ni estabilidad prolongada.',
 'Mods no instalados y motivos: consultar 01_MODLIST.csv. 30-35 no se forzaron por dependencias, conflictos y estabilidad.'
)
$readme|Set-Content -LiteralPath (Join-Path $pack '00_README.txt') -Encoding UTF8
[pscustomobject]@{InstalledForgeMods=$names.Count;OverlayFiles=$overlay.Count;DownloadedArchives=$download.Count;Readme=(Join-Path $pack '00_README.txt')}
