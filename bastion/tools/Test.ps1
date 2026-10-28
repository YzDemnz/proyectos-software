[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectDirectory = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Setup-Tools.ps1')
$compiler = Join-Path $PSScriptRoot 'bin/luau/luau-compile.exe'
$interpreter = Join-Path $PSScriptRoot 'bin/luau/luau.exe'
$analyzer = Join-Path $PSScriptRoot 'bin/luau/luau-analyze.exe'
$sharedSources = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'src/shared') -Filter '*.luau' -File | Sort-Object FullName)
$analysisOutput = & $analyzer @($sharedSources.FullName) 2>&1
if ($LASTEXITCODE -ne 0) { throw "Shared module typecheck failed:`n$analysisOutput" }
Write-Host ('PASS: {0} shared modules pass strict typecheck.' -f $sharedSources.Count)
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'src') -Filter '*.luau' -File -Recurse | Sort-Object FullName)
$testFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'tests') -Filter '*.spec.luau' -File | Sort-Object FullName)
$compiled = @()
foreach ($source in $sources) {
    $diagnostics = & $compiler '--null' $source.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Luau compilation failed: $($source.FullName)`n$diagnostics" }
    $compiled += $source.FullName.Substring($projectDirectory.Length + 1)
}
Write-Host ('PASS: {0} Luau source files compile.' -f $compiled.Count)
$passedTests = @()
foreach ($testFile in $testFiles) {
    $testOutput = & $interpreter $testFile.FullName 2>&1
    $testOutput | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "Luau test failed: $($testFile.Name)" }
    $passedTests += $testFile.Name
}
if ($testFiles.Count -eq 0) { throw 'No Luau tests found.' }
& (Join-Path $PSScriptRoot 'Test-Server.ps1')
$passedTests += 'ServerTransactions.suite.luau (production sources, engine stubs)'
$artifactDirectory = Join-Path $projectDirectory 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
$report = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    luauVersion = '0.738'
    compilation = 'passed'
    sharedStrictTypecheck = 'passed'
    compiledSourceFiles = $compiled
    passedTestSuites = $passedTests
    engineRuntimeTested = $false
    serverTransactionTests = 'production source wrappers with deterministic clock and engine stubs; Arsenal geometry gate substituted'
    engineChecksRemaining = @('Play Solo', 'Start Server with 2+ players', 'Pathfinding and collision', 'Camera and input', 'Audio and HUD')
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $artifactDirectory 'test-results.json') -Encoding UTF8
Write-Host 'PASS: all command-line checks. Roblox engine validation remains separate.'
