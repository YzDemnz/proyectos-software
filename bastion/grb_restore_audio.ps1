Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$manifestPath = 'E:\GRB_ULTIMATE_MODPACK\21_INSTALL_MANIFEST.csv'
if (Get-Process GRB,GRB_vulkan -ErrorAction SilentlyContinue) { throw 'Cierre el juego antes de restaurar.' }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'No existe manifiesto de instalacion.' }
$entries = @(Import-Csv -LiteralPath $manifestPath)
foreach ($entry in $entries) {
    if ($entry.Status -ne 'INSTALLED_HASH_VERIFIED') { continue }
    $current = (Get-FileHash -LiteralPath $entry.Target -Algorithm SHA256).Hash
    if ($current -ne $entry.ModSHA256) { throw "El archivo cambio despues de instalarlo: $($entry.Target)" }
    $backupHash = (Get-FileHash -LiteralPath $entry.Backup -Algorithm SHA256).Hash
    if ($backupHash -ne $entry.OriginalSHA256) { throw "Backup no coincide: $($entry.Backup)" }
    Copy-Item -LiteralPath $entry.Backup -Destination $entry.Target -Force
    $restored = (Get-FileHash -LiteralPath $entry.Target -Algorithm SHA256).Hash
    if ($restored -ne $entry.OriginalSHA256) { throw "Restauracion no coincide: $($entry.Target)" }
    $entry.Status = 'RESTORED_HASH_VERIFIED'
    $entry.VerifiedUtc = (Get-Date).ToUniversalTime().ToString('o')
    $entries | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8
}
$entries | Select-Object Mod,Target,Status
