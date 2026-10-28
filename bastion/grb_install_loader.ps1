Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$game = 'E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$pack = 'E:\GRB_ULTIMATE_MODPACK'
$zip = Join-Path $pack 'STAGING\GRB_Tweaks_0.1.6_BETA.zip'
$extract = Join-Path $pack 'STAGING\PRILER_EXTRACTED'
$target = Join-Path $game 'dinput8.dll'
$manifest = Join-Path $pack '21_INSTALL_MANIFEST.csv'
if (Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue) { throw 'El juego esta en ejecucion.' }
if (Test-Path -LiteralPath $target) { throw 'Ya existe dinput8.dll. No se sobreescribe.' }
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne '3506032B72F06B389CBB57FADAC0518CBA0889F69701EDE65D4B8A80E74DFF66') { throw 'ZIP del autor no coincide con hash registrado.' }
New-Item -ItemType Directory -Path $extract -Force | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
$source = Join-Path $extract 'dinput8.dll'
if (-not (Test-Path -LiteralPath $source)) { throw 'Falta dinput8.dll en el ZIP.' }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$rows = @(Import-Csv -LiteralPath $manifest)
$entry = [pscustomobject]@{Mod='Priler GRB Tweaks 0.1.6 BETA';Source=$source;Target=$target;Backup='';OriginalSHA256='';ModSHA256=$sourceHash;Status='PLANNED';VerifiedUtc=''}
$rows += $entry
$rows | Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
Copy-Item -LiteralPath $source -Destination $target
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $sourceHash) { throw 'DLL copiada no coincide.' }
$entry.Status = 'INSTALLED_HASH_VERIFIED_RUNTIME_PENDING'
$entry.VerifiedUtc = (Get-Date).ToUniversalTime().ToString('o')
$rows | Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
$entry | Select-Object Mod,Target,Status,ModSHA256
