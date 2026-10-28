$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) {
  throw 'Configura .env usando .env.example antes de iniciar LUMEN.'
}
if (-not (Test-Path -LiteralPath 'node_modules')) {
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
}
& npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
