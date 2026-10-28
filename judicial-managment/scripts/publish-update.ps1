param(
  [string]$ReleaseRepository = 'YzDemnz/judicial-managment-portal'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $projectRoot 'package.json'
$releaseNotesPath = Join-Path $projectRoot 'RELEASE_NOTES.md'
$releaseDir = Join-Path $projectRoot 'release'

Set-Location $projectRoot

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$version = [string]$package.version
$tag = "v$version"
$setupPath = Join-Path $releaseDir 'Judicial-Managment-Setup.exe'
$blockmapPath = Join-Path $releaseDir 'Judicial-Managment-Setup.exe.blockmap'
$latestPath = Join-Path $releaseDir 'latest.yml'

Write-Host "Construyendo Judicial Managment $version..."
& npm.cmd run desktop:build-update
if ($LASTEXITCODE -ne 0) {
  throw "La compilacion fallo con codigo $LASTEXITCODE."
}

foreach ($artifact in @($setupPath, $blockmapPath, $latestPath, $releaseNotesPath)) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    throw "Falta el archivo requerido: $artifact"
  }
}

$credential = "protocol=https`nhost=github.com`n`n" | git credential fill
$passwordLine = $credential | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
if (-not $passwordLine) {
  throw 'No se encontro una credencial de GitHub en Windows.'
}

$env:GH_TOKEN = $passwordLine.Substring('password='.Length)

try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    & gh release view $tag --repo $ReleaseRepository *> $null
    $releaseExists = $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($releaseExists) {
    Write-Host "Actualizando Release $tag..."
    & gh release upload $tag $setupPath $blockmapPath $latestPath --repo $ReleaseRepository --clobber
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron subir los archivos del parche.' }

    & gh release edit $tag --repo $ReleaseRepository --title "Judicial Managment $tag" --notes-file $releaseNotesPath --latest
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron actualizar las notas del parche.' }
  } else {
    Write-Host "Creando Release $tag..."
    & gh release create $tag $setupPath $blockmapPath $latestPath --repo $ReleaseRepository --title "Judicial Managment $tag" --notes-file $releaseNotesPath --latest
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el Release del parche.' }
  }

  Write-Host "Parche $version publicado correctamente."
} finally {
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
  $credential = $null
  $passwordLine = $null
}
