$ErrorActionPreference = 'Stop'
$game = 'E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$docs = 'E:\GRB_ULTIMATE_MODPACK'
$backup = 'E:\GRB_MODPACK_BACKUP'
if (!(Test-Path -LiteralPath (Join-Path $game 'GRB_vulkan.exe'))) { throw 'No se encontro GRB_vulkan.exe en la ruta auditada.' }
if (Test-Path -LiteralPath (Join-Path $docs '01_MODLIST.csv')) { throw 'La auditoria ya existe. Este script es de una sola ejecucion para no sobrescribir las matrices revisadas.' }
New-Item -ItemType Directory -Path $docs,$backup -Force | Out-Null
@('00_VANILLA_ORIGINALS','01_PREVIOUS_MODS','02_FORGE_BACKUPS','03_CONFIG_BACKUPS','04_RESTORE_INFO') | ForEach-Object { New-Item -ItemType Directory -Path (Join-Path $backup $_) -Force | Out-Null }
function Write-Doc($name,$value) { Set-Content -LiteralPath (Join-Path $docs $name) -Value $value -Encoding UTF8 }
$top = Get-ChildItem -LiteralPath $game -Force | Select-Object Name,PSIsContainer,Length,LastWriteTimeUtc
$top | Export-Csv -LiteralPath (Join-Path $docs '15_INITIAL_TOP_LEVEL_INVENTORY.csv') -NoTypeInformation -Encoding UTF8
$all = Get-ChildItem -LiteralPath $game -Recurse -Force -File -ErrorAction SilentlyContinue
$all | Where-Object { $_.Extension -eq '.forge' -or $_.Name -match '(?i)reshade|anvil|modmanager|tweaks|buildtable|dbcontainer|\.ini$' } | Select-Object FullName,Length,LastWriteTimeUtc | Export-Csv -LiteralPath (Join-Path $docs '16_MOD_MARKER_INVENTORY.csv') -NoTypeInformation -Encoding UTF8
$ids = @(2075,681,2032,13,1102,1180,1188,1186,1579,42,775,1246,442,1815,1564,1495,1958,1424,2016,0,1965,0,0,763,1064,0,700,736,1189,399,431,1252,1992,1109)
$names = @('Ghost Recon Breakpoint Photorealistic Graphics','Faust Climate Overhaul','Priler GRB Tweaks','Authentic Warfare Overhaul','Fear the Radio','Thank the Radio','Increased Enemy Presence in Bases','Sniper Enemies in the Wild','Remove Silencer Damage Debuff','Realistic Reticles','No Visible Laser Light','Tracer and Smoke Trail Removal Fixed','Real Weapon Names','MercerBlacks Improved Sling Positions','Unlock Everything 3.0','Pre-Patch / Individual Buildtables','Mackle HK416','MCX Raptor','SLR B-15','SCAR-L moderno por seleccionar','Noveske Shawty','Smith and Wesson M&P 2.0','Crye Precision G3','Crye AVS Loaded','Acosta Bison Belt','Peltor Comtacs IV','Ops-Core AMP Pack','Modular Helmets','Elite Iron Suppressor Wrap','Choose Your Loadout / Vanilla Loadout Remover','NPC Modern Loadouts','Shadow Company','Breach and Clear','Ma Deuce n Some / M2 Browning')
$versions = @{2032='0.1.6';13='0.26.0';1102='2.1 en archivos; pagina 1.0';1180='1.1';1188='1';1579='1.1';42='2.0';1564='3.0 en archivos; pagina 1.0';1958='1';1424='4';2016='por verificar';1965='1';681='0.1';1252='1.1';1992='1'}
$rows = for($i=0;$i -lt $names.Count;$i++) {
  $id=$ids[$i]; $url=if($id){"https://www.nexusmods.com/ghostreconbreakpoint/mods/$id"}else{'BUSQUEDA PENDIENTE'}
  [pscustomobject]@{Name=$names[$i];Version=if($versions.ContainsKey($id)){$versions[$id]}else{'POR VERIFICAR'};Source=$url;NexusID=if($id){$id}else{''};Installed='NO';Required='POR DECIDIR';Optional='POR DECIDIR';Dependencies='POR VERIFICAR EN ARCHIVO';ForgeFiles='POR VERIFICAR EN ARCHIVO';DBEntries='POR VERIFICAR EN ARCHIVO';Replaces='POR VERIFICAR EN ARCHIVO';Conflicts='MATRIZ PRELIMINAR';InstallMethod='POR DECIDIR';Status='NEEDS USER DOWNLOAD';Notes='No se encontro archivo local. Sin validacion de runtime.'}
}
$rows | Export-Csv -LiteralPath (Join-Path $docs '01_MODLIST.csv') -NoTypeInformation -Encoding UTF8
@(
  [pscustomobject]@{Mod='Mackle HK416';'Arma nueva'='HK416 Geissele';'Arma vanilla reemplazada'='HK416';Forge='DataPC_patch_01; DataPC_Resources_patch_01';'DB Entry'='POR VERIFICAR';'Attachments afectados'='PMAG; NGAL; MAWL; RAID XE; M600V; B5; CTR';Conflictos='Otros reemplazos HK416';Estado='SLOT DOCUMENTADO, ARCHIVO NO INSPECCIONADO'},
  [pscustomobject]@{Mod='MCX Raptor';'Arma nueva'='SIG MCX Raptor';'Arma vanilla reemplazada'='Silver Stake Tactical';Forge='POR VERIFICAR';'DB Entry'='POR VERIFICAR';'Attachments afectados'='POR VERIFICAR';Conflictos='Reportes de stock visual en Gunsmith';Estado='SLOT DOCUMENTADO, ARCHIVO NO INSPECCIONADO'},
  [pscustomobject]@{Mod='SLR B-15';'Arma nueva'='SLR B-15';'Arma vanilla reemplazada'='VHS D2 Survival';Forge='POR VERIFICAR';'DB Entry'='POR VERIFICAR';'Attachments afectados'='POR VERIFICAR';Conflictos='POR VERIFICAR';Estado='SLOT DOCUMENTADO, ARCHIVO NO INSPECCIONADO'},
  [pscustomobject]@{Mod='Noveske Shawty';'Arma nueva'='Noveske Shawty';'Arma vanilla reemplazada'='SN-9mm / PP-19';Forge='DataPC_extra_patch_01; DataPC_patch_01; DataPC_Resources_patch_01';'DB Entry'='POR VERIFICAR';'Attachments afectados'='POR VERIFICAR';Conflictos='Gunsmith desalineado; sin miras de hierro segun autor';Estado='SLOT DOCUMENTADO, ARCHIVO NO INSPECCIONADO'},
  [pscustomobject]@{Mod='SCAR-L moderno';'Arma nueva'='SCAR-L';'Arma vanilla reemplazada'='POR SELECCIONAR';Forge='POR VERIFICAR';'DB Entry'='POR VERIFICAR';'Attachments afectados'='POR VERIFICAR';Conflictos='POR VERIFICAR';Estado='PENDIENTE'},
  [pscustomobject]@{Mod='Smith and Wesson M&P 2.0';'Arma nueva'='M&P 2.0';'Arma vanilla reemplazada'='POR VERIFICAR';Forge='POR VERIFICAR';'DB Entry'='POR VERIFICAR';'Attachments afectados'='POR VERIFICAR';Conflictos='POR VERIFICAR';Estado='PENDIENTE'}
) | Export-Csv -LiteralPath (Join-Path $docs '04_WEAPON_REPLACER_MATRIX.csv') -NoTypeInformation -Encoding UTF8
$gear=@('Crye Precision G3','Crye AVS Loaded','Acosta Bison Belt','Peltor Comtacs IV','Ops-Core AMP Pack','Modular Helmets','Elite Iron Suppressor Wrap','Breach and Clear player modules','Vanilla Loadout Remover')
$gear | ForEach-Object { [pscustomobject]@{Mod=$_;'Pieza nueva'='POR INSPECCIONAR';'Pieza original'='POR INSPECCIONAR';Buildtable='POR INSPECCIONAR';Forge='POR INSPECCIONAR';Dependencias='POR INSPECCIONAR';Conflictos='POR INSPECCIONAR';Estado='ARCHIVO NO DISPONIBLE'} } | Export-Csv -LiteralPath (Join-Path $docs '05_GEAR_REPLACER_MATRIX.csv') -NoTypeInformation -Encoding UTF8
@(
  [pscustomobject]@{'Mod A'='Shadow Company';'Mod B'='Breach and Clear faction overhaul';Forge='DataPC_patch_01 / Resources por confirmar';Archivo='NPC assets por confirmar';'DB Entry'='POR INSPECCIONAR';Buildtable='POR INSPECCIONAR';'Tipo de conflicto'='Ambos reemplazan Sentinel; Breach and Clear tambien Wolves';Resolucion='Elegir un solo overhaul; preferencia provisional Shadow Company'},
  [pscustomobject]@{'Mod A'='Shadow Company';'Mod B'='NPC Modern Loadouts';Forge='POR INSPECCIONAR';Archivo='NPC loadouts por confirmar';'DB Entry'='POR INSPECCIONAR';Buildtable='POR INSPECCIONAR';'Tipo de conflicto'='Posible solapamiento Sentinel/Wolves';Resolucion='No combinar sin comparar archivos'},
  [pscustomobject]@{'Mod A'='Priler GRB Tweaks';'Mod B'='Remove Silencer Damage Debuff';Forge='DataPC_patch_01 para mod separado';Archivo='Parametros de supresor';'DB Entry'='POR INSPECCIONAR';Buildtable='';'Tipo de conflicto'='Control de dano potencialmente duplicado';Resolucion='Verificar si Priler modifica penalizacion de supresor; escoger uno'},
  [pscustomobject]@{'Mod A'='Authentic Warfare Overhaul';'Mod B'='Otros sound mods';Forge='sounddata/pc';Archivo='soundspc_sfx*.pck por inspeccionar';'DB Entry'='POSIBLE';Buildtable='';'Tipo de conflicto'='Sobrescritura de audio';Resolucion='AWO como unica base de audio, comparar archivo por archivo'},
  [pscustomobject]@{'Mod A'='Faust Climate';'Mod B'='Otro climate overhaul';Forge='DataPC_TGT_WorldMap_Bootstrap_Split_patch_01';Archivo='0_-_TGT_WorldMap.data';'DB Entry'='';Buildtable='';'Tipo de conflicto'='Un clima principal';Resolucion='Seleccionar solo uno'},
  [pscustomobject]@{'Mod A'='Unlock Everything 3.0';'Mod B'='Campana / propiedad premium';Forge='DataPC.forge; DataPC_patch_01';Archivo='DBContainer por inspeccionar';'DB Entry'='POR INSPECCIONAR';Buildtable='';'Tipo de conflicto'='Desbloquea todo segun autor; no hay separacion comprobada de contenido premium';Resolucion='BLOQUEADO hasta probar variante legal separable'}
) | Export-Csv -LiteralPath (Join-Path $docs '03_CONFLICT_MATRIX.csv') -NoTypeInformation -Encoding UTF8
Write-Doc '00_README.txt' @'
GHOST RECON BREAKPOINT - ULTIMATE TACTICAL
Estado: AUDITORIA INICIAL / STATIC VALIDATION ONLY. No hay mods instalados por esta tarea.
Juego: E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint (Ubisoft Connect registrado)
Fecha de auditoria: 2026-09-23
Vulkan: GRB_vulkan.exe existe. No se ha iniciado ni validado graficamente.
Se encontraron 27 archivos .forge en la raiz y ninguna carpeta mods o Extracted.
Las matrices son PRELIMINARES; no se puede declarar compatibilidad por archivo sin descargar e inspeccionar los archivos del autor.
Los archivos 15 y 16 son el inventario local. El archivo 17 contiene hashes cuando termine el calculo.
Ningun save fue abierto o modificado. No se tocaron archivos del juego.
'@
Write-Doc '02_INSTALL_ORDER.txt' 'PENDIENTE. Secuencia propuesta: vanilla Vulkan, backup de cada destino, herramientas, ModLoader, audio/gameplay, QRF, faction unica, armas en slots distintos, equipo, clima, ReShade Vulkan. Probar cada bloque antes del siguiente.'
Write-Doc '06_CONFIG_CHANGES.txt' 'NINGUNO. No se modifico GRB_Tweaks.ini, Forge, ReShade, Ubisoft Connect ni saves.'
Write-Doc '07_VULKAN_NOTES.txt' 'GRB_vulkan.exe presente. Vulkan es obligatorio. No instalar ShaderToggler/No-HUD-No-Effects ni ReShade DX11 hasta demostrar compatibilidad Vulkan. Runtime Vulkan sin probar.'
Write-Doc '08_REJECTED_MODS.txt' 'RECHAZO PROVISIONAL: Unlock Everything 3.0 completo: la descripcion afirma desbloquear todo y exige sustituir DataPC.forge; no hay separacion verificada del contenido premium. No-HUD-No-Effects/ShaderToggler pendiente de verificar Vulkan. No se ha descartado otro candidato definitivamente.'
Write-Doc '09_BACKUP_LOCATION.txt' "Backup reservado: $backup`nCarpetas 00 a 04 creadas. No se copiaron originales porque aun no se ha seleccionado ningun archivo para modificar. No llamar a esto backup completo."
Write-Doc '10_RUNTIME_TESTS.txt' 'STATIC VALIDATION ONLY. No se inicio GRB_vulkan.exe. Arranque, campana, save, armas, equipo, IA, clima, FPS y logs pendientes.'
Write-Doc '11_KNOWN_ISSUES.txt' 'Nexus requiere descarga manual/autenticacion para archivos. Los slots, DB entries y archivos internos no pueden confirmarse sin los paquetes. MCX Raptor: reporte de stock visual anomalo en Gunsmith. Noveske Shawty: autor declara desalineacion de Gunsmith y ausencia de miras de hierro.'
Write-Doc '12_RESTORE_GUIDE.txt' 'Estado actual: esta tarea no modifico el juego; no hay cambios de juego que restaurar. Cuando se instalen mods, registrar cada destino y SHA-256 previo en el manifiesto; restaurar desde GRB_MODPACK_BACKUP, comprobar hashes y retirar solo carpetas agregadas por esta tarea. No tocar saves. No borrar ni sustituir carpetas sin manifiesto completo.'
Write-Doc '13_OPTIONAL_MODULES.txt' 'TACTICAL por defecto. HELL / Fear the Radio Nightmare / US Defence Budget: inactivos; archivos no descargados. No activar hasta prueba individual de QRF y densidad.'
Write-Doc '14_UPDATE_GUIDE.txt' 'Antes de actualizar: descargar de fuente oficial, verificar version y changelog, inspeccionar archivo y diferencias de destinos, copiar originales y hashes, probar un solo mod por bloque en Vulkan, revertir si falla. No usar Replace All.'
Write-Doc '18_MANUAL_DOWNLOADS.txt' "Los 34 candidatos figuran en 01_MODLIST.csv con enlace Nexus cuando hay ID. No se ha descargado ninguno; Nexus requiere acceso/autenticacion manual para las descargas. Descargar solo el archivo principal actual y las variantes especificas tras revisar matriz y requisitos. No descargar ni instalar Unlock Everything 3.0 completo hasta separar legalmente contenido no poseido."
Write-Output $docs
