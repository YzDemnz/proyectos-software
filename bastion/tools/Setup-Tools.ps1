[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'toolchain.lock.json') -Raw | ConvertFrom-Json
$cacheDirectory = Join-Path $PSScriptRoot 'downloads'
$binaryDirectory = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Path $cacheDirectory, $binaryDirectory -Force | Out-Null

foreach ($tool in $manifest.tools) {
    $archive = Join-Path $cacheDirectory ($tool.name + '-' + $tool.version + '.zip')
    if (-not (Test-Path -LiteralPath $archive)) {
        Write-Host ('Downloading official {0} {1}' -f $tool.name, $tool.version)
        Invoke-WebRequest -Uri $tool.url -OutFile $archive -UseBasicParsing
    }
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $tool.sha256) {
        throw "Archive integrity failed: $archive. Expected $($tool.sha256); got $actualHash."
    }
    $destination = Join-Path $binaryDirectory $tool.name
    Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    foreach ($executable in $tool.executables) {
        if (-not (Test-Path -LiteralPath (Join-Path $destination $executable))) {
            throw "Verified archive does not contain expected executable: $executable"
        }
    }
    Write-Host ('Verified {0} {1} (SHA-256)' -f $tool.name, $tool.version)
}
