Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$pack = 'E:\GRB_ULTIMATE_MODPACK'
$staging = Join-Path $pack 'STAGING'
$installed = @(Import-Csv -LiteralPath (Join-Path $pack '21_INSTALL_MANIFEST.csv'))
$modlist = @(Import-Csv -LiteralPath (Join-Path $pack '01_MODLIST.csv'))
foreach ($mod in $modlist) {
    switch ($mod.NexusID) {
        '13' {
            $mod.Installed = 'YES - AUDIO ONLY'
            $mod.Status = 'INSTALLED_HASH_VERIFIED; RUNTIME PENDING'
            $mod.ForgeFiles = 'sounddata/pc/soundspc_sfx.pck; sounddata/pc/soundspc_sfx_wea_.pck'
            $mod.InstallMethod = 'Exact PCK copy after verified vanilla backup'
            $mod.Notes = 'Main and Weapon modules only. Both installed PCK SHA256 match staging. No game test yet.'
        }
        '2032' {
            $mod.Installed = 'YES - DLL ONLY'
            $mod.Status = 'INSTALLED_HASH_VERIFIED; RUNTIME PENDING'
            $mod.InstallMethod = 'dinput8.dll in game root'
            $mod.Notes = 'Loader DLL installed and hash verified; INI and forgemod overlay not yet activated. Game runtime pending.'
        }
        '1958' {
            $mod.Version = 'v4 main file'
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.ForgeFiles = 'DataPC_patch_01; DataPC_Resources_patch_01'
            $mod.DBEntries = 'ASR_416.GR_WeaponDBEntry; Magazine_ASR_SMALL_BASE.MagazineAttachmentDBEntry'
            $mod.Replaces = 'HK416'
            $mod.Notes = 'Main RAR and DB fix downloaded; overlay paths need exact mapping and runtime test.'
        }
        '2035' {
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.ForgeFiles = 'DataPC_patch_01.forge; DataPC_Resources_patch_01.forge; DataPC_extra_patch_01.forge'
            $mod.DBEntries = 'ASR_MK17_ASU.GR_WeaponDBEntry; ISGHT-BCM_ASR_MK17_ASU.ScopeAttachmentDBEntry'
            $mod.Notes = 'ZIP downloaded; replaces MK17 Assault; archive uses .forge-suffixed folder names and requires mapping before loader activation.'
        }
        '1579' {
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.DBEntries = '83 muzzle attachment DB entries'
            $mod.ForgeFiles = 'DataPC_patch_01/DBContainer (author instruction)'
            $mod.Notes = 'ZIP SHA256 matches Nexus VirusTotal link; overlaps possible with suppressor and weapon edits. Awaiting loader mapping and runtime test.'
        }
        '42' {
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.ForgeFiles = 'DataPC_Resources.forge; DataPC_Resources_patch_01.forge'
            $mod.Notes = 'ZIP SHA256 matches Nexus VirusTotal link; includes base Resources file, so loader overlay preferred. No base Forge modification.'
        }
        '775' {
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.ForgeFiles = 'DataPC_Resources_patch_01.forge'
            $mod.Notes = 'Two loose .data files; ZIP SHA256 matches Nexus VirusTotal link. Staged in inactive overlay.'
        }
        '1886' {
            $mod.Version = '1.1 main file'
            $mod.Status = 'DOWNLOADED; INSPECTED; NOT INSTALLED'
            $mod.ForgeFiles = 'DataPC_patch_01/23_-_TEAMMATE_Template; DataPC_Resources_patch_01'
            $mod.DBEntries = '5 BuildTable files'
            $mod.Notes = 'Main 1.1 ZIP SHA256 matches Nexus VirusTotal link. Optional G3 Additions not downloaded. Staged in inactive overlay.'
        }
    }
}
$modlist | Export-Csv -LiteralPath (Join-Path $pack '01_MODLIST.csv') -NoTypeInformation -Encoding UTF8

$files = Get-ChildItem -LiteralPath $staging -File
$manifest = foreach ($file in $files) {
    $status = if ($file.Name -like 'AWO_*') { 'DOWNLOADED; AUDIO INSTALLED' } elseif ($file.Name -like '*DISABLED*' -or $file.Name -like 'More_Enemies*') { 'DOWNLOADED; INACTIVE' } else { 'DOWNLOADED; NOT INSTALLED' }
    [pscustomobject]@{Name=$file.BaseName;Path=$file.FullName;Bytes=$file.Length;SHA256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash;Status=$status}
}
$manifest | Export-Csv -LiteralPath (Join-Path $pack '20_DOWNLOAD_MANIFEST.csv') -NoTypeInformation -Encoding UTF8

$readme = @'
GHOST RECON BREAKPOINT - ULTIMATE TACTICAL
Estado: INSTALACION PARCIAL / PRUEBA DE JUEGO PENDIENTE.
Juego: E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint.
Fecha de auditoria: 2026-09-23.
Instalado por esta tarea: 2 modulos de audio AWO 0.26.0 y dinput8.dll de Priler GRB Tweaks 0.1.6 BETA. Los tres archivos coinciden por SHA-256 con staging.
Backup: E:\GRB_MODPACK_BACKUP; seis archivos originales copiados y verificados con SHA-256. Los PCK originales estan en 00_VANILLA_ORIGINALS.
Manifiesto de cambios: 21_INSTALL_MANIFEST.csv. No se modificaron saves ni archivos Forge.
Vulkan: GRB_vulkan.exe existe. Un intento de inicio abrio Ubisoft Connect, pero el juego salio enseguida. No hay prueba de render, menu o campana.
Priler Forge ModLoader sigue sin configurarse ni probarse. Fear/Thank the Radio, armas, equipo, clima, IA y ReShade estan pendientes de instalacion y prueba.
Se preparo STAGING\MODLOADER_LAYOUT_INACTIVE con archivos de ocho mods; no se copio a la carpeta del juego. Consultar 22_INACTIVE_OVERLAY_INVENTORY.csv para el conteo actualizado.
Las matrices de conflicto son preliminares salvo los archivos descargados inspeccionados. El contenido premium no se desbloqueo.
'@
Set-Content -LiteralPath (Join-Path $pack '00_README.txt') -Value $readme -Encoding UTF8
$runtime = @'
2026-09-23: Se inicio GRB_vulkan.exe desde PowerShell; devolvio PID 23644, luego salio. Se abrieron UbisoftGameLauncher y upc (Ubisoft Connect). No hay evidencia de que el juego haya cargado render, menu ni mundo.
Pendiente: inicio de sesion en Ubisoft Connect y nueva prueba Vulkan; menu, save, audio, IA, FPS y estabilidad sin verificar.
'@
Set-Content -LiteralPath (Join-Path $pack '10_RUNTIME_TESTS.txt') -Value $runtime -Encoding UTF8
$restore = @'
Instalado por esta tarea: dos PCK de AWO y dinput8.dll de Priler. Manifiesto: E:\GRB_ULTIMATE_MODPACK\21_INSTALL_MANIFEST.csv.
Restaurar audio con C:\Users\leo_j\OneDrive\Documentos\Proyecto Juris\grb_restore_audio.ps1 (PowerShell). El script exige juego cerrado, compara hashes instalados y de backups, copia originales y verifica el resultado.
Retirar la DLL con C:\Users\leo_j\OneDrive\Documentos\Proyecto Juris\grb_restore_loader.ps1. Verifica el hash antes de eliminar el archivo agregado.
Backup original: E:\GRB_MODPACK_BACKUP\00_VANILLA_ORIGINALS\sounddata\pc.
No se han alterado saves ni archivos Forge. Las carpetas STAGING y TOOLS son externas al juego.
'@
Set-Content -LiteralPath (Join-Path $pack '12_RESTORE_GUIDE.txt') -Value $restore -Encoding UTF8
$installed | Select-Object Mod,Status,Target
