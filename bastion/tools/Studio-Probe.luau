print("BASTION_STUDIO_PROBE_BEGIN", version(), game.Name)
print("BASTION_STUDIO_HAS_TESTS", pcall(function() return game:GetService("StudioTestService").EditModeActive end))
print("BASTION_STUDIO_PROBE_END")
