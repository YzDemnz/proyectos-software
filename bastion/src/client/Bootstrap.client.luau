--!nonstrict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")
local Players = game:GetService("Players")

local bastion = ReplicatedStorage:WaitForChild("Bastion")
local shared = bastion:WaitForChild("Shared")
local remotesFolder = bastion:WaitForChild("Remotes")
local ctx = {
	Config = require(shared:WaitForChild("GameConfig")),
	WeaponConfig = require(shared:WaitForChild("WeaponConfig")),
	Remotes = {}, State = nil,
}
for _, name in {"WeaponFire", "WeaponAction", "PlayerState", "GetState", "CombatFX", "ArsenalOpen", "ArsenalRequest"} do
	ctx.Remotes[name] = remotesFolder:WaitForChild(name)
end

local HUDController = require(script.Parent:WaitForChild("HUDController"))
local FirstPersonController = require(script.Parent:WaitForChild("FirstPersonController"))
local WeaponSystem = require(script.Parent:WaitForChild("WeaponSystem"))
ctx.HUD = HUDController.new(ctx)
ctx.FirstPerson = FirstPersonController.new(ctx)
ctx.Weapons = WeaponSystem.new(ctx)
local active, requesting, requestToken = true, false, 0
local connections = {}

local function acceptState(state)
	if not active or type(state) ~= "table" or type(state.revision) ~= "number" or type(state.inventory) ~= "table" or type(state.stats) ~= "table" then return end
	if ctx.State and state.revision < ctx.State.revision then return end
	local first = ctx.State == nil
	ctx.State = state
	ctx.FirstPerson:OnState(state)
	ctx.Weapons:OnState(state)
	ctx.HUD:OnState(state)
	if first then ctx.HUD:Notify("Rifle listo. Reúnete con tu escuadra y resiste.") end
end

function ctx.RequestState()
	if not active or requesting then return end
	requesting = true
	requestToken += 1
	local token = requestToken
	task.delay((ctx.Config.Client or {}).RequestTimeout or 8, function()
		if active and requestToken == token then requesting = false end
	end)
	task.spawn(function()
		local ok, state = pcall(function() return ctx.Remotes.GetState:InvokeServer() end)
		if not active then return end
		if requestToken == token then requesting = false end
		if ok then acceptState(state) end
	end)
end

-- Subscribe before the initial snapshot so spawning cannot race the handshake.
table.insert(connections, ctx.Remotes.PlayerState.OnClientEvent:Connect(acceptState))
table.insert(connections, ctx.Remotes.CombatFX.OnClientEvent:Connect(function(event) if active then ctx.Weapons:HandleFX(event) end end))
table.insert(connections, ctx.Remotes.ArsenalOpen.OnClientEvent:Connect(function() if active then ctx.HUD:OpenArsenal() end end))
ctx.HUD:Start()
ctx.FirstPerson:Start()
ctx.Weapons:Start()
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)
ctx.RequestState()

task.spawn(function()
	while active do
		task.wait((ctx.Config.Client or {}).StateRefreshInterval or 2)
		ctx.RequestState()
	end
end)

local function cleanup()
	if not active then return end
	active = false
	for _, connection in connections do connection:Disconnect() end
	ctx.Weapons:Destroy()
	ctx.FirstPerson:Destroy()
	ctx.HUD:Destroy()
end
table.insert(connections, script.Destroying:Connect(cleanup))
table.insert(connections, Players.LocalPlayer.AncestryChanged:Connect(function(_, parent) if not parent then cleanup() end end))
