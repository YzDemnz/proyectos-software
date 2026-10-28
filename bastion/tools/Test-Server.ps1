[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectDirectory = Split-Path -Parent $PSScriptRoot
$artifactDirectory = Join-Path $projectDirectory 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
$builder = New-Object System.Text.StringBuilder
[void]$builder.AppendLine('-- Generated from unmodified production sources. Engine services are supplied by the isolated test harness.')
[void]$builder.AppendLine('local factories = {}')
foreach ($moduleName in @('EconomyService', 'ArsenalService', 'CombatService')) {
    $source = Get-Content -LiteralPath (Join-Path $projectDirectory "src/server/$moduleName.luau") -Raw
    [void]$builder.AppendLine("factories.$moduleName = function(runtime)")
    [void]$builder.AppendLine('local game, task, Random, typeof, require = runtime.game, runtime.task, runtime.Random, runtime.typeof, runtime.require')
    [void]$builder.AppendLine($source)
    [void]$builder.AppendLine('end')
}
[void]$builder.AppendLine('require("../tests/ServerTransactions.suite")(factories)')
$generatedPath = Join-Path $artifactDirectory 'ServerTransactions.generated.luau'
[System.IO.File]::WriteAllText($generatedPath, $builder.ToString(), (New-Object System.Text.UTF8Encoding($false)))
$output = & (Join-Path $PSScriptRoot 'bin/luau/luau.exe') $generatedPath 2>&1
$output | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw 'Server transaction/reload/rejection tests failed.' }
