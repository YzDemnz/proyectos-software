--!nonstrict
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local PlayerDataService = {}
PlayerDataService.__index = PlayerDataService

local function disconnectAll(connections)
	for _, connection in connections do connection:Disconnect() end
	table.clear(connections)
end

function PlayerDataService.new(ctx)
	return setmetatable({ ctx = ctx, records = {}, connections = {}, started = false }, PlayerDataService)
end

function PlayerDataService:_ResetInventory(record)
	local id = self.ctx.WeaponConfig.StarterWeapon
	local stats = self.ctx.WeaponConfig.GetStats(id)
	record.money = self.ctx.Config.Economy.StartingMoney
	record.equipped = id
	record.inventory = { [id] = { magazine = stats.MagazineSize, reserve = stats.MaxReserve,
		levels = self.ctx.WeaponConfig.NewLevels() } }
	record.damageCarry, record.kills, record.headshots = 0, 0, 0
end

function PlayerDataService:Get(player)
	return self.records[player]
end

function PlayerDataService:IsAlive(player)
	local record = self.records[player]
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	return record ~= nil and record.alive and humanoid ~= nil and humanoid.Health > 0
		and character:FindFirstChild("HumanoidRootPart") ~= nil
end

function PlayerDataService:GetAlivePlayers()
	local result = {}
	for player in self.records do
		if self:IsAlive(player) then table.insert(result, player) end
	end
	return result
end

function PlayerDataService:HasSpawningPlayers()
	for _, record in self.records do
		if record.spawning then return true end
	end
	return false
end

function PlayerDataService:Snapshot(player)
	local record = self.records[player]
	if not record then return nil end
	local inventory = {}
	for id, weapon in record.inventory do
		inventory[id] = { magazine = weapon.magazine, reserve = weapon.reserve, levels = table.clone(weapon.levels) }
	end
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	return {
		revision = record.revision, money = record.money, equipped = record.equipped,
		inventory = inventory, stats = self.ctx.WeaponConfig.GetStats(record.equipped, record.inventory[record.equipped].levels),
		reloading = record.reloading, reloadEndsAt = record.reloadEndsAt,
		alive = self:IsAlive(player), sprinting = record.sprinting, crouching = record.crouching, ads = record.ads,
		health = if humanoid and record.alive then humanoid.Health else 0,
		maxHealth = self.ctx.Config.Movement.MaxHealth,
		lastShotId = record.lastShotId, kills = record.kills, headshots = record.headshots,
	}
end

function PlayerDataService:Push(player)
	local record = self.records[player]
	if not record or player.Parent ~= Players then return end
	record.revision += 1
	player:SetAttribute("EquippedWeapon", record.equipped)
	self.ctx.Remotes.PlayerState:FireClient(player, self:Snapshot(player))
end

function PlayerDataService:PushAll()
	for player in self.records do self:Push(player) end
end

function PlayerDataService:_BindCharacter(player, character)
	local record = self.records[player]
	if not record then return end
	disconnectAll(record.characterConnections)
	record.alive = false
	local humanoid = character:WaitForChild("Humanoid", 10)
	local root = character:WaitForChild("HumanoidRootPart", 10)
	if self.records[player] ~= record or player.Character ~= character or not humanoid or not root then return end
	local movement = self.ctx.Config.Movement
	humanoid.MaxHealth, humanoid.Health = movement.MaxHealth, movement.MaxHealth
	humanoid.UseJumpPower, humanoid.JumpPower = true, movement.JumpPower
	humanoid.WalkSpeed = movement.WalkSpeed
	record.baseHipHeight = humanoid.HipHeight
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	local spawnLocation = self.ctx.World.SpawnLocation
	player.RespawnLocation = spawnLocation
	local offset = Vector3.new((player.UserId % 3 - 1) * 3, 4, 0)
	character:PivotTo(spawnLocation.CFrame + offset)
	record.sprinting, record.crouching, record.ads = false, false, false
	record.nextFireAt, record.equipReadyAt = 0, 0
	record.reloadToken += 1
	record.reloading, record.reloadEndsAt = false, 0
	for id, weapon in record.inventory do
		local stats = self.ctx.WeaponConfig.GetStats(id, weapon.levels)
		weapon.magazine, weapon.reserve = stats.MagazineSize, stats.MaxReserve
	end
	local now = Workspace:GetServerTimeNow()
	record.movement = { position = root.Position, cframe = root.CFrame, time = now,
		budget = movement.MovementBurstBudget, lastCorrection = 0 }
	local protectedUntil = now + movement.SpawnProtection
	player:SetAttribute("SpawnProtectedUntil", protectedUntil)
	character:SetAttribute("SpawnProtectedUntil", protectedUntil)
	local shield = Instance.new("ForceField")
	shield.Name, shield.Visible, shield.Parent = "SpawnProtection", true, character
	task.delay(movement.SpawnProtection, function()
		if shield.Parent then shield:Destroy() end
	end)
	local function registerPart(part)
		if part:IsA("BasePart") then part.CollisionGroup = "BastionPlayers" end
	end
	for _, descendant in character:GetDescendants() do registerPart(descendant) end
	table.insert(record.characterConnections, character.DescendantAdded:Connect(registerPart))
	record.alive = true
	table.insert(record.characterConnections, humanoid.HealthChanged:Connect(function()
		self:Push(player)
	end))
	table.insert(record.characterConnections, humanoid.Died:Connect(function()
		if self.records[player] ~= record then return end
		record.alive = false
		record.sprinting, record.crouching, record.ads = false, false, false
		self.ctx.Combat:CancelReload(player)
		self:Push(player)
	end))
	self:Push(player)
end

function PlayerDataService:Spawn(player)
	local record = self.records[player]
	if not record or record.spawning or player.Parent ~= Players then return end
	record.spawning = true
	task.spawn(function()
		local ok, message = pcall(function() player:LoadCharacterAsync() end)
		if self.records[player] == record then
			record.spawning = false
			if not ok then
				warn("[Bastion] Character load failed: " .. tostring(message))
				self.ctx.Remotes.CombatFX:FireClient(player, { kind = "Notice", message = "No se pudo cargar el personaje; reintentando." })
				task.delay(3, function()
					if self.records[player] == record and not self:IsAlive(player) then self:Spawn(player) end
				end)
			end
		end
	end)
end

function PlayerDataService:RespawnDead()
	for player in self.records do
		if not self:IsAlive(player) then self:Spawn(player) end
	end
end

function PlayerDataService:ResetRun()
	for player, record in self.records do
		self.ctx.Combat:CancelReload(player)
		self:_ResetInventory(record)
		record.alive = false
		self:Push(player)
		self:Spawn(player)
	end
end

function PlayerDataService:_AddPlayer(player)
	if self.records[player] then return end
	local record = {
		revision = 0, lastShotId = 0, nextFireAt = 0, equipReadyAt = 0,
		alive = false, spawning = false, sprinting = false, crouching = false, ads = false,
		reloading = false, reloadEndsAt = 0, reloadToken = 0,
		characterConnections = {}, playerConnections = {},
	}
	self:_ResetInventory(record)
	self.records[player] = record
	table.insert(record.playerConnections, player.CharacterAdded:Connect(function(character)
		self:_BindCharacter(player, character)
	end))
	table.insert(record.playerConnections, player.CharacterRemoving:Connect(function()
		record.alive = false
		self.ctx.Combat:CancelReload(player)
		disconnectAll(record.characterConnections)
		self:Push(player)
	end))
	if player.Character then task.spawn(function() self:_BindCharacter(player, player.Character) end)
	else self:Spawn(player) end
end

function PlayerDataService:Start()
	if self.started then return end
	self.started = true
	Players.CharacterAutoLoads = false
	table.insert(self.connections, Players.PlayerAdded:Connect(function(player) self:_AddPlayer(player) end))
	table.insert(self.connections, Players.PlayerRemoving:Connect(function(player)
		local record = self.records[player]
		if not record then return end
		record.reloadToken += 1
		disconnectAll(record.characterConnections)
		disconnectAll(record.playerConnections)
		self.records[player] = nil
	end))
	for _, player in Players:GetPlayers() do self:_AddPlayer(player) end
end

function PlayerDataService:Destroy()
	disconnectAll(self.connections)
	for _, record in self.records do
		record.reloadToken += 1
		disconnectAll(record.characterConnections)
		disconnectAll(record.playerConnections)
	end
	table.clear(self.records)
	self.started = false
end
return PlayerDataService
