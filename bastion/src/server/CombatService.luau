--!nonstrict
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local Rules = require(game:GetService("ReplicatedStorage").Bastion.Shared.SessionRules)
local CombatService = {}
CombatService.__index = CombatService

local function finiteVector(vector)
	return typeof(vector) == "Vector3" and Rules.IsFinite(vector.X) and Rules.IsFinite(vector.Y) and Rules.IsFinite(vector.Z)
end

function CombatService.new(ctx)
	return setmetatable({ ctx = ctx, connections = {}, started = false, random = Random.new() }, CombatService)
end

function CombatService:_Rate(record, key, now, rate, capacity)
	local bucket = record[key]
	if not bucket then bucket = { time = now, tokens = capacity }; record[key] = bucket end
	return Rules.TakeToken(bucket, now, rate, capacity)
end

function CombatService:CancelReload(player)
	local record = self.ctx.PlayerData:Get(player)
	if not record then return end
	record.reloadToken += 1
	record.reloading, record.reloadEndsAt = false, 0
end

function CombatService:ApplyMovement(player)
	local record = self.ctx.PlayerData:Get(player)
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not record or not humanoid then return end
	local movement = self.ctx.Config.Movement
	humanoid.WalkSpeed = if record.crouching then movement.CrouchSpeed
		elseif record.ads then movement.ADSSpeed elseif record.sprinting then movement.SprintSpeed else movement.WalkSpeed
	humanoid.JumpPower = if record.crouching then 0 else movement.JumpPower
	if record.baseHipHeight then
		humanoid.HipHeight = math.max(0, record.baseHipHeight - (if record.crouching then movement.CrouchHipHeightOffset else 0))
	end
end

-- Fast server position envelope and solid-wall check. This is a correction guard,
-- not Roblox's optional engine server-authority beta; avatar physics remain predicted.
function CombatService:ValidatePosition(player)
	local record = self.ctx.PlayerData:Get(player)
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if not record or not root or not record.movement then return false end
	local state, movement = record.movement, self.ctx.Config.Movement
	local now = Workspace:GetServerTimeNow()
	local dt = math.clamp(now - state.time, 0, 2)
	local position = root.Position
	local valid = finiteVector(position) and math.abs(position.X) <= self.ctx.Config.World.HalfSize + movement.MovementSlack
		and math.abs(position.Z) <= self.ctx.Config.World.HalfSize + movement.MovementSlack
		and position.Y >= self.ctx.Config.World.KillY and position.Y < self.ctx.Config.World.WallHeight + movement.MovementSlack
	local delta = if valid then position - state.position else Vector3.zero
	local speed = if record.crouching then movement.CrouchSpeed elseif record.ads then movement.ADSSpeed
		elseif record.sprinting then movement.SprintSpeed else movement.WalkSpeed
	local budget = math.min(movement.MovementBurstBudget, state.budget + (speed + 2) * dt)
	local distance = Vector3.new(delta.X, 0, delta.Z).Magnitude
	if valid and (distance > budget or math.abs(delta.Y) > movement.MaxVerticalSpeed * dt + movement.MovementSlack) then valid = false end
	if valid and delta.Magnitude > 0.01 then
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Include
		params.FilterDescendantsInstances = { self.ctx.World.Model, Workspace.Terrain }
		params.RespectCanCollide = true
		local obstruction = Workspace:Raycast(state.position, delta, params)
		if obstruction and obstruction.Distance < delta.Magnitude - 0.005 then valid = false end
	end
	state.time = now
	if valid then
		state.position, state.cframe = position, root.CFrame
		state.budget = math.max(0, budget - distance)
		return true
	end
	root.CFrame = state.cframe
	root.AssemblyLinearVelocity, root.AssemblyAngularVelocity = Vector3.zero, Vector3.zero
	state.budget = 0
	return false
end

function CombatService:_Reload(player)
	local record = self.ctx.PlayerData:Get(player)
	if not record or not self.ctx.PlayerData:IsAlive(player) or record.reloading then return end
	local weapon = record.inventory[record.equipped]
	local stats = self.ctx.WeaponConfig.GetStats(record.equipped, weapon.levels)
	if weapon.magazine >= stats.MagazineSize or weapon.reserve <= 0 then self.ctx.PlayerData:Push(player); return end
	record.sprinting = false
	self:ApplyMovement(player)
	record.reloadToken += 1
	local token, weaponId = record.reloadToken, record.equipped
	record.reloading = true
	record.reloadEndsAt = Workspace:GetServerTimeNow() + stats.ReloadTime
	self.ctx.PlayerData:Push(player)
	task.delay(stats.ReloadTime, function()
		if self.ctx.PlayerData:Get(player) ~= record or record.reloadToken ~= token
			or record.equipped ~= weaponId or not self.ctx.PlayerData:IsAlive(player) then return end
		weapon.magazine, weapon.reserve = Rules.ReloadTransfer(weapon.magazine, weapon.reserve, stats.MagazineSize)
		record.reloading, record.reloadEndsAt = false, 0
		self.ctx.PlayerData:Push(player)
	end)
end

function CombatService:_Action(player, action, value)
	local record = self.ctx.PlayerData:Get(player)
	if not record or type(action) ~= "string" then return end
	local config, now = self.ctx.Config.Combat, Workspace:GetServerTimeNow()
	if not self:_Rate(record, "actionBucket", now, config.ActionRate, config.ActionBurst) then return end
	if action == "Reload" then self:_Reload(player); return end
	if type(value) ~= "boolean" or not self.ctx.PlayerData:IsAlive(player) then return end
	if action == "Sprint" then
		record.sprinting = value and not record.crouching and not record.ads and not record.reloading
	elseif action == "Crouch" then
		record.crouching = value
		if value then record.sprinting = false end
	elseif action == "ADS" then
		record.ads = value
		if value then record.sprinting = false end
	else return end
	self:ApplyMovement(player)
	self.ctx.PlayerData:Push(player)
end

function CombatService:_Fire(player, shotId, cameraOrigin, aimDirection)
	local record = self.ctx.PlayerData:Get(player)
	if not record then return end
	local config, now = self.ctx.Config.Combat, Workspace:GetServerTimeNow()
	if not self:_Rate(record, "fireBucket", now, config.MaxRemoteRate, config.RemoteBurst) then return end
	if not Rules.IsInteger(shotId, 1, config.MaxShotId) or shotId <= record.lastShotId then return end
	-- Acknowledge rejected shot predictions too. Untrusted IDs never determine damage.
	record.lastShotId = shotId
	local function reject() self.ctx.PlayerData:Push(player) end
	if not finiteVector(cameraOrigin) or not finiteVector(aimDirection) then reject(); return end
	local length = aimDirection.Magnitude
	if length < 0.95 or length > 1.05 or not self.ctx.PlayerData:IsAlive(player) then reject(); return end
	local weapon = record.inventory[record.equipped]
	local stats = self.ctx.WeaponConfig.GetStats(record.equipped, weapon.levels)
	if not Rules.CanFire(record, now, stats, config.FireRateTolerance) then reject(); return end
	if not self:ValidatePosition(player) then reject(); return end
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not head or not root or not finiteVector(head.Position) or (head.Position - root.Position).Magnitude > config.MaxOriginDistance
		or (cameraOrigin - head.Position).Magnitude > config.MaxOriginDistance then reject(); return end
	local exclusions = { character }
	for _, otherPlayer in Players:GetPlayers() do
		if otherPlayer ~= player and otherPlayer.Character then table.insert(exclusions, otherPlayer.Character) end
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = exclusions
	params.IgnoreWater = true
	local cameraDelta = cameraOrigin - head.Position
	if cameraDelta.Magnitude > 0.1 and Workspace:Raycast(head.Position, cameraDelta, params) then reject(); return end
	-- The head is the server-known firing origin. No client-provided muzzle, target,
	-- hit part, damage, ammo or claimed headshot is trusted.
	local origin = head.Position
	local direction = aimDirection.Unit
	local spread = math.rad(if record.ads then stats.ADSSpread else stats.HipSpread)
	local theta = self.random:NextNumber(0, math.pi * 2)
	local radius = math.sqrt(self.random:NextNumber()) * math.tan(spread)
	direction = (CFrame.lookAt(Vector3.zero, direction)
		:VectorToWorldSpace(Vector3.new(math.cos(theta) * radius, math.sin(theta) * radius, -1))).Unit
	weapon.magazine -= 1
	-- Do not accumulate credit while idle or allow clients to queue a burst.
	record.nextFireAt = math.max(now, record.nextFireAt) + stats.FireInterval
	local result = Workspace:Raycast(origin, direction * stats.Range, params)
	local position = if result then result.Position else origin + direction * stats.Range
	local hitFX
	if result then
		local zombie = self.ctx.Zombies:GetModelFromHit(result.Instance)
		if zombie then
			local headshot = result.Instance.Name == "Head"
			local multiplier = self.ctx.WeaponConfig.ZoneMultipliers[result.Instance.Name] or 1
			local actualDamage, killed = self.ctx.Zombies:Damage(zombie, stats.Damage * multiplier)
			if actualDamage > 0 then
				self.ctx.Economy:RewardDamage(player, actualDamage, killed, headshot)
				hitFX = { kind = "Hit", shotId = shotId, damage = actualDamage, killed = killed, headshot = headshot }
			end
		end
	end
	self.ctx.PlayerData:Push(player)
	local fx = { kind = "Shot", userId = player.UserId, shotId = shotId, origin = origin,
		position = position, weaponId = record.equipped }
	for _, recipient in Players:GetPlayers() do
		local recipientRoot = recipient.Character and recipient.Character:FindFirstChild("HumanoidRootPart")
		if recipient == player or (recipientRoot and (recipientRoot.Position - origin).Magnitude <= config.MaxFXDistance) then
			self.ctx.Remotes.CombatFX:FireClient(recipient, fx)
		end
	end
	if hitFX then self.ctx.Remotes.CombatFX:FireClient(player, hitFX) end
end

function CombatService:Start()
	if self.started then return end
	self.started = true
	table.insert(self.connections, self.ctx.Remotes.WeaponFire.OnServerEvent:Connect(function(...) self:_Fire(...) end))
	table.insert(self.connections, self.ctx.Remotes.WeaponAction.OnServerEvent:Connect(function(...) self:_Action(...) end))
	local elapsed = 0
	table.insert(self.connections, RunService.Heartbeat:Connect(function(dt)
		elapsed += dt
		if elapsed < self.ctx.Config.Movement.MovementCheckInterval then return end
		elapsed = 0
		for _, player in self.ctx.PlayerData:GetAlivePlayers() do self:ValidatePosition(player) end
	end))
end

function CombatService:Destroy()
	for _, connection in self.connections do connection:Disconnect() end
	table.clear(self.connections)
	self.started = false
end
return CombatService
