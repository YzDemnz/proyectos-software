--!nonstrict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PhysicsService = game:GetService("PhysicsService")
local Workspace = game:GetService("Workspace")

-- Set this before requiring/building any service so no auto-spawn races the map.
Players.CharacterAutoLoads = false
local packageFolder = ReplicatedStorage:WaitForChild("Bastion")
local Config = require(packageFolder.Shared.GameConfig)
local WeaponConfig = require(packageFolder.Shared.WeaponConfig)
local Rules = require(packageFolder.Shared.SessionRules)
local ctx = { Config = Config, WeaponConfig = WeaponConfig, Remotes = {} }

local remotesFolder = Instance.new("Folder")
remotesFolder.Name = "Remotes"
for name, class in {
	WeaponFire = "RemoteEvent", WeaponAction = "RemoteEvent", PlayerState = "RemoteEvent",
	CombatFX = "RemoteEvent", ArsenalOpen = "RemoteEvent", ArsenalRequest = "RemoteFunction", GetState = "RemoteFunction",
} do
	local remote = Instance.new(class)
	remote.Name, remote.Parent = name, remotesFolder
	ctx.Remotes[name] = remote
end

for _, name in { "BastionPlayers", "BastionZombies" } do
	if not PhysicsService:IsCollisionGroupRegistered(name) then PhysicsService:RegisterCollisionGroup(name) end
end
PhysicsService:CollisionGroupSetCollidable("BastionPlayers", "BastionPlayers", false)
PhysicsService:CollisionGroupSetCollidable("BastionPlayers", "BastionZombies", false)
PhysicsService:CollisionGroupSetCollidable("BastionZombies", "BastionZombies", false)

Workspace:SetAttribute("Round", 0)
Workspace:SetAttribute("WavePhase", "Waiting")
Workspace:SetAttribute("ZombiesRemaining", 0)
Workspace:SetAttribute("NextWaveAt", 0)

local worldService = require(script.Parent.WorldService).new(ctx)
ctx.World = worldService:Build()
ctx.PlayerData = require(script.Parent.PlayerDataService).new(ctx)
ctx.Economy = require(script.Parent.EconomyService).new(ctx)
ctx.Combat = require(script.Parent.CombatService).new(ctx)
ctx.Arsenal = require(script.Parent.ArsenalService).new(ctx)
ctx.Zombies = require(script.Parent.ZombieService).new(ctx)
ctx.Waves = require(script.Parent.WaveService).new(ctx)

ctx.Remotes.GetState.OnServerInvoke = function(player)
	local record = ctx.PlayerData:Get(player)
	if not record then return nil end
	local now = Workspace:GetServerTimeNow()
	if not record.stateBucket then record.stateBucket = { time = now, tokens = 4 } end
	if not Rules.TakeToken(record.stateBucket, now, 2, 4) then return nil end
	return ctx.PlayerData:Snapshot(player)
end

ctx.Combat:Start()
ctx.Arsenal:Start()
ctx.Zombies:Start()
ctx.PlayerData:Start()
ctx.Waves:Start()
-- Publishing the folder last is the client readiness barrier; all handlers exist.
remotesFolder.Parent = packageFolder
Workspace:SetAttribute("BastionReady", true)
print("[Bastion] READY: world, combat, economy, arsenal, zombies and waves initialized.")

game:BindToClose(function()
	if ctx.Waves.Destroy then ctx.Waves:Destroy() end
	if ctx.Zombies.Destroy then ctx.Zombies:Destroy() else ctx.Zombies:Clear() end
	ctx.Arsenal:Destroy()
	ctx.Combat:Destroy()
	ctx.PlayerData:Destroy()
end)
