param(
  [string]$IdentityName = $env:JM_STORE_IDENTITY_NAME,
  [string]$Publisher = $env:JM_STORE_PUBLISHER,
  [string]$PublisherDisplayName = $env:JM_STORE_PUBLISHER_DISPLAY_NAME
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Set-WindowsKitsPath {
  if (-not [string]::IsNullOrWhiteSpace($env:ELECTRON_BUILDER_WINDOWS_KITS_PATH)) {
    return
  }

  $kitsRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
  if (-not (Test-Path -LiteralPath $kitsRoot)) {
    return
  }

  $kit = Get-ChildItem -LiteralPath $kitsRoot -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64' } |
    Where-Object {
      (Test-Path -LiteralPath (Join-Path $_ 'makeappx.exe')) -and
      (Test-Path -LiteralPath (Join-Path $_ 'makepri.exe'))
    } |
    Select-Object -First 1

  if ($kit) {
    $env:ELECTRON_BUILDER_WINDOWS_KITS_PATH = $kit
    Write-Host "Windows SDK detectado para AppX: $kit"
  }
}

function Assert-AppxAssets {
  $assetDir = Join-Path $projectRoot 'build\appx'
  $requiredAssets = @(
    'StoreLogo.png',
    'Square44x44Logo.png',
    'Square150x150Logo.png',
    'Wide310x150Logo.png'
  )

  foreach ($asset in $requiredAssets) {
    $path = Join-Path $assetDir $asset
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Falta el asset AppX $asset en build\appx. Genera los assets antes de empaquetar para Store."
    }
  }
}

if ([string]::IsNullOrWhiteSpace($IdentityName)) {
  throw 'Falta JM_STORE_IDENTITY_NAME. Copia el valor Package/Identity/Name desde Partner Center.'
}

if ([string]::IsNullOrWhiteSpace($Publisher)) {
  throw 'Falta JM_STORE_PUBLISHER. Copia el valor Package/Identity/Publisher desde Partner Center.'
}

if ([string]::IsNullOrWhiteSpace($PublisherDisplayName)) {
  throw 'Falta JM_STORE_PUBLISHER_DISPLAY_NAME. Usa el nombre visible del publicador en Partner Center.'
}

Set-WindowsKitsPath
Assert-AppxAssets

Write-Host "Validando Judicial Managment para Microsoft Store..."
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck fallo con codigo $LASTEXITCODE." }

& npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw "Lint fallo con codigo $LASTEXITCODE." }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build web fallo con codigo $LASTEXITCODE." }

Write-Host "Generando paquete MSIX/AppX para Partner Center..."
& npx.cmd electron-builder --win appx --x64 --publish never `
  "-c.appx.identityName=$IdentityName" `
  "-c.appx.publisher=$Publisher" `
  "-c.appx.publisherDisplayName=$PublisherDisplayName" `
  "-c.appx.displayName=Judicial Managment" `
  "-c.appx.applicationId=JudicialManagment" `
  "-c.appx.backgroundColor=#0C1424" `
  "-c.appx.languages=es-MX" `
  "-c.win.signAndEditExecutable=false"

if ($LASTEXITCODE -ne 0) {
  throw "La generacion MSIX/AppX fallo con codigo $LASTEXITCODE. Verifica que este instalado Windows SDK."
}

Write-Host "Paquete listo en: $projectRoot\release"
