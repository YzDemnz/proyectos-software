--!strict
-- Gameplay numbers live here or in WeaponConfig. No external assets are required.
local Config = {
	Title = "BASTION / NIGHT SHIFT",
	Movement = {
		WalkSpeed = 14, SprintSpeed = 22, CrouchSpeed = 8, ADSSpeed = 9,
		JumpPower = 38, MaxHealth = 100, CrouchCameraOffset = -1.35, CrouchHipHeightOffset = 0.6,
		SpawnProtection = 4, MovementCheckInterval = 0.5,
		MovementSlack = 10, MovementBurstBudget = 18, MaxVerticalSpeed = 100,
		CameraFOV = 78, ADSFOV = 58, SprintFOV = 84, CameraResponse = 14,
		BobAmount = 0.045, BobFrequency = 9, SwayAmount = 0.0018,
		RecoilReturn = 15, RecoilCameraScale = 0.55,
	},
	Combat = {
		MaxOriginDistance = 5, FireRateTolerance = 0.015,
		MaxRemoteRate = 24, RemoteBurst = 32, ActionRate = 10, ActionBurst = 14,
		MaxShotId = 2147483647, MaxFXDistance = 260, TracerLifetime = 0.07,
		ImpactLifetime = 0.18, HitmarkerDuration = 0.16,
		EquipDuration = 0.35,
	},
	Economy = {
		StartingMoney = 500, DamageMoneyPerHP = 0.12, KillReward = 80,
		HeadshotBonus = 45, WaveReward = 125, MaxMoney = 9999999,
	},
	Arsenal = { Range = 13, PromptRange = 10, RequestInterval = 0.2, HoldDuration = 0.25 },
	Zombie = {
		BaseHealth = 110, HealthPerRound = 24, HealthPerExtraPlayer = 0.12,
		BaseSpeed = 8, SpeedPerRound = 0.4, MaxSpeed = 16,
		BaseDamage = 13, DamagePerRound = 1.2, MaxDamage = 30,
		AttackRange = 4.6, AttackCooldown = 1.1, AttackWindup = 0.3,
		ThinkInterval = 0.15, RetargetInterval = 0.7, PathInterval = 1.4,
		MaxConcurrentPaths = 3, MaxPathRequestsPerTick = 2,
		WaypointReach = 2.8, StuckTimeout = 5, MaxLifetime = 180,
		CorpseLifetime = 2, SpawnMinDistance = 25, SpawnMaxDistance = 220,
		AgentRadius = 2, AgentHeight = 5, WaypointSpacing = 5,
		PathTargetMoved = 8, StuckMoveThreshold = 2, MaxStuckRecoveries = 3, MaxHealth = 5000,
		SpawnFailureTimeout = 12, SpawnEmergencyDistance = 12,
		AnimationRate = 8, AnimationAmplitude = 0.55,
	},
	Wave = {
		FirstIntermission = 10, Intermission = 18, DefeatDelay = 8,
		BaseCount = 6, CountPerRound = 3, CountPerExtraPlayer = 4,
		MaxWaveCount = 120, MaxAlive = 22, ExtraAlivePerPlayer = 4, HardMaxAlive = 36,
		SpawnInterval = 0.9, MinSpawnInterval = 0.3, SpawnIntervalReduction = 0.025,
		TickInterval = 0.25, SpawnStallTimeout = 30,
	},
	World = {
		Name = "BastionComplex", HalfSize = 112, WallHeight = 16,
		ClockTime = 1.2, Brightness = 2, FogEnd = 350,
		KillY = -25,
		DoorWidth = 14, WallThickness = 2, FloorThickness = 2,
		ArsenalPosition = { -76, 3.5, 75 }, PlayerSpawnPosition = { -76, 1, 89 },
	},
	Client = {
		StateRefreshInterval = 2, ArsenalDistanceInterval = 0.2, RequestTimeout = 8,
		FireAckTimeout = 1.5, MaxPendingShots = 16, ViewmodelResponse = 16,
		ViewmodelNearPlane = 0.6, EquipDuration = 0.35, RecoilKickback = 0.075,
		NoticeDuration = 3, UIScaleWidth = 1440,
	},
	Audio = {
		-- Built-in Roblox sounds are placeholders. Override with licensed asset IDs.
		Fire = "rbxasset://sounds/impact_explosion_03.mp3",
		Reload = "rbxasset://sounds/action_get_up.mp3",
		Empty = "rbxasset://sounds/volume_slider.ogg",
		Hit = "rbxasset://sounds/volume_slider.ogg",
		Purchase = "rbxasset://sounds/volume_slider.ogg",
		FireVolume = 0.15, ReloadVolume = 0.25, HitVolume = 0.3,
	},
}
return table.freeze(Config)
