--!nonstrict
local Workspace = game:GetService("Workspace")
local ArsenalService = {}
ArsenalService.__index = ArsenalService

function ArsenalService.new(ctx)
	return setmetatable({ ctx = ctx, connections = {}, started = false }, ArsenalService)
end

function ArsenalService:_CanInteract(player)
	if not self.ctx.PlayerData:IsAlive(player) or not self.ctx.Combat:ValidatePosition(player) then return false end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	local head = player.Character and player.Character:FindFirstChild("Head")
	local terminal = self.ctx.World.ArsenalPart
	if not root or not head or not terminal or not terminal.Parent then return false end
	if (root.Position - terminal.Position).Magnitude > self.ctx.Config.Arsenal.Range then return false end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { self.ctx.World.Model, Workspace.Terrain }
	params.RespectCanCollide = true
	local ray = Workspace:Raycast(head.Position, terminal.Position - head.Position, params)
	return ray == nil or ray.Instance == terminal
end

function ArsenalService:_Equip(player, record, weaponId)
	self.ctx.Combat:CancelReload(player)
	record.equipped = weaponId
	record.sprinting, record.ads = false, false
	record.equipReadyAt = Workspace:GetServerTimeNow() + self.ctx.Config.Combat.EquipDuration
	self.ctx.Combat:ApplyMovement(player)
end

function ArsenalService:_Request(player, action, weaponId, upgradeKey)
	local record = self.ctx.PlayerData:Get(player)
	if not record then return { ok = false, message = "Personaje no disponible." } end
	local now = Workspace:GetServerTimeNow()
	if now < (record.nextArsenalAt or 0) then return { ok = false, message = "Espera un momento." } end
	record.nextArsenalAt = now + self.ctx.Config.Arsenal.RequestInterval
	if type(action) ~= "string" or type(weaponId) ~= "string" then return { ok = false, message = "Solicitud inválida." } end
	local config = self.ctx.WeaponConfig
	local definition = config.Weapons[weaponId]
	if not definition then return { ok = false, message = "Arma no disponible." } end
	if not self:_CanInteract(player) then return { ok = false, message = "Acércate al Arsenal para operar." } end
	local weapon = record.inventory[weaponId]
	local message
	-- No yielding between checking money/ownership and committing an operation.
	if action == "Buy" then
		if weapon then return { ok = false, message = "Ya tienes esta arma." } end
		if not self.ctx.Economy:Spend(player, definition.Price) then return { ok = false, message = "Fondos insuficientes." } end
		local stats = config.GetStats(weaponId)
		record.inventory[weaponId] = { magazine = stats.MagazineSize, reserve = stats.MaxReserve, levels = config.NewLevels() }
		self:_Equip(player, record, weaponId)
		message = "Arma comprada y equipada."
	elseif action == "Equip" then
		if not weapon then return { ok = false, message = "Primero compra esta arma." } end
		if record.equipped == weaponId then return { ok = true, message = "Arma ya equipada." } end
		self:_Equip(player, record, weaponId)
		message = "Arma equipada."
	elseif action == "Ammo" then
		if not weapon then return { ok = false, message = "Primero compra esta arma." } end
		local stats = config.GetStats(weaponId, weapon.levels)
		if weapon.reserve >= stats.MaxReserve then return { ok = false, message = "La reserva ya está llena." } end
		if not self.ctx.Economy:Spend(player, definition.AmmoPrice) then return { ok = false, message = "Fondos insuficientes." } end
		weapon.reserve = stats.MaxReserve
		message = "Reserva de munición reabastecida."
	elseif action == "Upgrade" then
		if not weapon then return { ok = false, message = "Primero compra esta arma." } end
		if type(upgradeKey) ~= "string" or not config.Upgrades[upgradeKey] then return { ok = false, message = "Mejora inválida." } end
		local level = weapon.levels[upgradeKey]
		local price = config.GetUpgradePrice(upgradeKey, level)
		if not price then return { ok = false, message = "Mejora al nivel máximo." } end
		if not self.ctx.Economy:Spend(player, price) then return { ok = false, message = "Fondos insuficientes." } end
		if record.equipped == weaponId then self.ctx.Combat:CancelReload(player) end
		weapon.levels[upgradeKey] = level + 1
		-- Capacity upgrades create capacity, never free bullets. Reload fills it.
		message = config.Upgrades[upgradeKey].Name .. " mejorado a nivel " .. tostring(level + 1) .. "."
	else
		return { ok = false, message = "Operación inválida." }
	end
	self.ctx.PlayerData:Push(player)
	return { ok = true, message = message }
end

function ArsenalService:Start()
	if self.started then return end
	self.started = true
	local terminal = self.ctx.World.ArsenalPart
	terminal:SetAttribute("ArsenalTerminal", true)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name, prompt.ActionText, prompt.ObjectText = "ArsenalPrompt", "Abrir Arsenal", "ARSENAL / SUMINISTROS"
	prompt.KeyboardKeyCode, prompt.GamepadKeyCode = Enum.KeyCode.E, Enum.KeyCode.ButtonX
	prompt.HoldDuration = self.ctx.Config.Arsenal.HoldDuration
	prompt.MaxActivationDistance = self.ctx.Config.Arsenal.PromptRange
	prompt.RequiresLineOfSight = false -- Server checks actual map geometry and range.
	prompt.Parent = terminal
	self.prompt = prompt
	table.insert(self.connections, prompt.Triggered:Connect(function(player)
		local record = self.ctx.PlayerData:Get(player)
		local now = Workspace:GetServerTimeNow()
		if not record or now < (record.nextPromptAt or 0) then return end
		record.nextPromptAt = now + self.ctx.Config.Arsenal.RequestInterval
		if self:_CanInteract(player) then self.ctx.Remotes.ArsenalOpen:FireClient(player) end
	end))
	self.ctx.Remotes.ArsenalRequest.OnServerInvoke = function(...) return self:_Request(...) end
end

function ArsenalService:Destroy()
	for _, connection in self.connections do connection:Disconnect() end
	table.clear(self.connections)
	if self.prompt then self.prompt:Destroy() end
	self.ctx.Remotes.ArsenalRequest.OnServerInvoke = nil
	self.started = false
end
return ArsenalService
