Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$manifest = 'E:\GRB_ULTIMATE_MODPACK\21_INSTALL_MANIFEST.csv'
if (Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue) { throw 'Cierre el juego antes de restaurar.' }
$rows = @(Import-Csv -LiteralPath $manifest)
$entry = @($rows | Where-Object Mod -EQ 'Priler GRB Tweaks 0.1.6 BETA')
if ($entry.Count -ne 1) { throw 'No hay entrada unica del loader.' }
if ($entry[0].Status -notlike 'INSTALLED*') { throw 'El loader ya no esta instalado segun manifiesto.' }
if ((Get-FileHash -LiteralPath $entry[0].Target -Algorithm SHA256).Hash -ne $entry[0].ModSHA256) { throw 'DLL cambio despues de instalar. No se elimina.' }
Remove-Item -LiteralPath $entry[0].Target
$entry[0].Status = 'RESTORED_REMOVED_VERIFIED'
$entry[0].VerifiedUtc = (Get-Date).ToUniversalTime().ToString('o')
$rows | Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
$entry[0] | Select-Object Mod,Target,Status
