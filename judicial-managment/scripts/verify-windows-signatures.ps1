param(
  [switch]$RequireValid
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot 'release'
$targets = @(
  (Join-Path $releaseDir 'Judicial-Managment-Setup.exe'),
  (Join-Path $releaseDir 'win-unpacked\Judicial Managment.exe')
)

$results = foreach ($target in $targets) {
  if (-not (Test-Path -LiteralPath $target)) {
    throw "Falta el archivo requerido: $target"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $target
  [pscustomobject]@{
    Archivo = $target
    Estado = [string]$signature.Status
    Publicador = if ($signature.SignerCertificate) {
      $signature.SignerCertificate.Subject
    } else {
      'Sin firma'
    }
  }
}

$results | Format-Table -AutoSize

if ($RequireValid -and ($results.Estado -contains 'NotSigned' -or $results.Estado -contains 'HashMismatch')) {
  throw 'La publicacion requiere firmas Authenticode validas.'
}
