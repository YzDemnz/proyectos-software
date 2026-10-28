[CmdletBinding()]
param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectDirectory = Split-Path -Parent $PSScriptRoot
if ($SkipTests) {
    & (Join-Path $PSScriptRoot 'Setup-Tools.ps1')
} else {
    & (Join-Path $PSScriptRoot 'Test.ps1')
}
$rojo = Join-Path $PSScriptRoot 'bin/rojo/rojo.exe'
$projectFile = Join-Path $projectDirectory 'default.project.json'
$artifactDirectory = Join-Path $projectDirectory 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
$placeFile = Join-Path $artifactDirectory 'Bastion.rbxlx'
& $rojo build $projectFile --output $placeFile
if ($LASTEXITCODE -ne 0) { throw 'Rojo place build failed.' }
& $rojo sourcemap $projectFile --output (Join-Path $artifactDirectory 'sourcemap.json')
if ($LASTEXITCODE -ne 0) { throw 'Rojo sourcemap generation failed.' }
$xml = New-Object System.Xml.XmlDocument
$xml.Load($placeFile)
foreach ($service in @('ReplicatedStorage', 'ServerScriptService', 'StarterPlayer', 'StarterGui', 'Workspace', 'Lighting')) {
    if ($null -eq $xml.SelectSingleNode("/roblox/Item[@class='$service']")) { throw "Missing built service: $service" }
}
$embeddedScripts = @($xml.SelectNodes("//Item[@class='Script' or @class='LocalScript' or @class='ModuleScript']"))
$sourceCount = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'src') -Filter '*.luau' -Recurse -File).Count
if ($embeddedScripts.Count -ne $sourceCount) { throw "Built script count $($embeddedScripts.Count) differs from source count $sourceCount." }
$buildReport = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    rojoVersion = '7.7.0'
    artifact = 'artifacts/Bastion.rbxlx'
    sha256 = (Get-FileHash -LiteralPath $placeFile -Algorithm SHA256).Hash.ToLowerInvariant()
    embeddedScripts = $embeddedScripts.Count
    requiredServicesValidated = $true
    engineRuntimeTested = $false
}
$buildReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactDirectory 'build-results.json') -Encoding UTF8
Write-Host ('PASS: Rojo built and XML-validated {0} ({1} scripts).' -f $placeFile, $embeddedScripts.Count)
