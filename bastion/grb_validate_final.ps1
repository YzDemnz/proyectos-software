Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$game='E:\Ubisoft Game Launcher\games\Ghost Recon Breakpoint'
$pack='E:\GRB_ULTIMATE_MODPACK'
$log=Get-Content -LiteralPath (Join-Path $game 'GRB_Tweaks.log')
$proc=Get-Process GRB_vulkan -ErrorAction SilentlyContinue | Select-Object -First 1
$m1=@(Import-Csv -LiteralPath (Join-Path $pack '23_OVERLAY_INSTALL_MANIFEST.csv'))
$m2=@(Import-Csv -LiteralPath (Join-Path $pack '25_ADDITIONAL_INSTALL_MANIFEST.csv'))
$active=@($m1+$m2|Where-Object Status -eq 'COPIED_HASH_VERIFIED')
$missing=@($active|Where-Object {-not (Test-Path -LiteralPath $_.Target)})
$mods=@(Get-ChildItem -LiteralPath (Join-Path $game 'mods') -Directory | Where-Object Name -ne '.cache')
$result=[pscustomobject]@{
    Date=(Get-Date).ToString('s'); ProcessID=if($proc){$proc.Id}else{$null}; Responding=if($proc){$proc.Responding}else{$false};
    VulkanBackend=[bool]($log|Where-Object {$_ -match 'Vulkan backend selected'});
    FirstPresent=[bool]($log|Where-Object {$_ -match 'vulkan: first present'});
    PlatformReady=[bool]($log|Where-Object {$_ -match 'vulkan: platform ready'});
    LoaderFileCount=([regex]::Match(($log|Where-Object {$_ -match 'stamped mods\\.cache against'}|Select-Object -Last 1),'against (\d+) mod file')).Groups[1].Value;
    ActiveModFolders=$mods.Count;ManifestActiveFiles=$active.Count;MissingActiveFiles=$missing.Count;
    ExplicitFaultWarning=[bool]($log|Where-Object {$_ -match 'game is expected to fault'});
    ReferenceWarnings=@($log|Where-Object {$_ -match 'no longer points at'}).Count;
    OverlayFailures=@($log|Where-Object {$_ -match 'forgemod:.*[1-9]\d* failure\(s\)'}).Count;
    FirstPersonEnabled=[bool]((Get-Content -LiteralPath (Join-Path $game 'GRB_Tweaks.ini') -Raw) -match '(?ms)^\[firstperson\]\s*\r?\nenabled\s*=\s*1');
    SavesTouchedByInstaller=$false;
    GameplayVerified=$false
}
$result|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $pack '26_FINAL_VALIDATION.json') -Encoding UTF8
$result
