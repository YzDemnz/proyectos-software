--!strict
-- Art/quality settings only. Gameplay values remain in GameConfig and WeaponConfig.
-- RGB tuples and material names keep this module usable by the offline validator.
local VisualConfig = {
	Version = "research-annex-01",
	Budget = { Parts = 1320, ImportedPartsPerModel = 80, LocalLights = 24, ShadowLights = 3, Emitters = 5, ParticlesPerSecond = 12 },
	Architecture = { PanelSpacing = 18, WallBandHeight = 4.1, SkinDepth = 0.055, MaximumWallLength = 220, FloorMarkDepth = 0.012, FloorMarkHeight = 0.098 },
	Palette = {
		Concrete = { 79, 84, 81 }, ConcreteDark = { 47, 53, 53 }, Plaster = { 118, 124, 115 },
		Paint = { 50, 70, 65 }, Steel = { 51, 61, 60 }, SteelEdge = { 102, 115, 111 },
		Rust = { 119, 76, 48 }, Rubber = { 24, 29, 29 }, Ivory = { 197, 199, 174 },
		Amber = { 240, 166, 66 }, Ice = { 140, 205, 204 }, Red = { 186, 65, 46 },
		Olive = { 74, 85, 56 }, Canvas = { 129, 122, 92 }, Glass = { 67, 110, 111 },
		Asphalt = { 41, 46, 46 }, Dust = { 150, 158, 145 }, Monitor = { 86, 172, 149 },
	},
	Lighting = {
		ClockTime = 1.55, Brightness = 2.2, ExposureCompensation = -0.06,
		Ambient = { 57, 66, 72 }, OutdoorAmbient = { 73, 86, 98 },
		EnvironmentDiffuseScale = 0.42, EnvironmentSpecularScale = 0.72,
		ShadowSoftness = 0.28, FogStart = 180, FogEnd = 440, FogColor = { 37, 51, 59 },
		AtmosphereDensity = 0.27, AtmosphereOffset = 0.12,
		AtmosphereColor = { 150, 170, 170 }, AtmosphereDecay = { 50, 64, 77 },
		AtmosphereGlare = 0.06, AtmosphereHaze = 1.35,
		GradeBrightness = 0.025, GradeContrast = 0.13, GradeSaturation = -0.18, GradeTint = { 223, 235, 231 },
		BloomIntensity = 0.13, BloomSize = 20, BloomThreshold = 1.75,
		ExistingLightBrightness = 1.65, EmergencyBrightness = 0.75, TaskBrightness = 1.1,
		TaskRange = 22, EmergencyRange = 19, SpotRange = 52, SpotAngle = 88,
	},
	Particles = {
		Texture = "rbxasset://textures/particles/smoke_main.dds",
		DustRate = 1, SteamRate = 2, Lifetime = { 3, 6 }, DustSpeed = { 0.1, 0.3 }, SteamSpeed = { 0.5, 0.9 },
		DustSize = 0.075, SteamSize = 1.5, DustTransparency = 0.66, SteamTransparency = 0.91, DistanceCull = 140,
	},
	AssetIntegration = {
		-- Exact, sanitized template names accepted from ServerStorage/Bastion/VisualAssets.
		MilitaryCrate = "MilitaryCrate", OilDrum = "OilDrum", IndustrialPipe = "IndustrialPipe",
		Generator = "Generator", LabProps = "LabProps", AbandonedVehicle = "AbandonedVehicle",
		MaximumSourceExtent = 512, MinimumSourceExtent = 0.01,
	},
}
return table.freeze(VisualConfig)
