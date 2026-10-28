--!nonstrict
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")

local HUDController = {}
HUDController.__index = HUDController
local C = {
	Background = Color3.fromRGB(12, 18, 22), Panel = Color3.fromRGB(22, 30, 35),
	Line = Color3.fromRGB(54, 70, 76), Text = Color3.fromRGB(224, 231, 226),
	Muted = Color3.fromRGB(141, 159, 163), Accent = Color3.fromRGB(174, 223, 175),
	Amber = Color3.fromRGB(238, 188, 110), Red = Color3.fromRGB(234, 98, 87),
}

local function frame(parent, name, size, position, color, transparency)
	local item = Instance.new("Frame")
	item.Name, item.Size, item.Position = name, size, position or UDim2.new()
	item.BackgroundColor3, item.BackgroundTransparency = color or C.Panel, transparency or 0
	item.BorderSizePixel, item.Parent = 0, parent
	return item
end
local function label(parent, name, text, size, position, fontSize, color)
	local item = Instance.new("TextLabel")
	item.Name, item.Text, item.Size, item.Position = name, text, size, position
	item.BackgroundTransparency, item.TextColor3, item.TextSize = 1, color or C.Text, fontSize or 16
	item.Font, item.TextXAlignment, item.TextYAlignment = Enum.Font.GothamMedium, Enum.TextXAlignment.Left, Enum.TextYAlignment.Center
	item.Parent = parent
	return item
end
local function outline(parent, color)
	local stroke = Instance.new("UIStroke")
	stroke.Color, stroke.Thickness, stroke.Transparency, stroke.Parent = color or C.Line, 1, 0.25, parent
	local corner = Instance.new("UICorner")
	corner.CornerRadius, corner.Parent = UDim.new(0, 4), parent
end
local function button(parent, name, text, size, position)
	local item = Instance.new("TextButton")
	item.Name, item.Text, item.Size, item.Position = name, text, size, position
	item.BackgroundColor3, item.TextColor3, item.TextSize = C.Accent, C.Background, 14
	item.Font, item.BorderSizePixel, item.AutoButtonColor, item.Parent = Enum.Font.GothamBold, 0, true, parent
	outline(item)
	return item
end
local function money(value) return "$ " .. tostring(math.floor(value or 0)) end

function HUDController.new(ctx)
	return setmetatable({ctx = ctx, connections = {}, started = false, pending = false, requestGeneration = 0,
		open = false, selected = "Rifle", hitUntil = 0, noticeUntil = 0, damageUntil = 0}, HUDController)
end

function HUDController:Build()
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
	local previous = playerGui:FindFirstChild("BastionHUD")
	if previous then previous:Destroy() end
	local gui = Instance.new("ScreenGui")
	gui.Name, gui.ResetOnSpawn, gui.IgnoreGuiInset, gui.DisplayOrder = "BastionHUD", false, true, 20
	gui.ZIndexBehavior, gui.Parent = Enum.ZIndexBehavior.Sibling, playerGui
	self.gui = gui
	self.root = frame(gui, "HUD", UDim2.fromScale(1, 1), nil, C.Background, 1)
	local brand = label(self.root, "Title", self.ctx.Config.Title, UDim2.fromOffset(340, 28), UDim2.fromOffset(28, 42), 15, C.Accent)
	brand.Font = Enum.Font.GothamBold
	label(self.root, "Subtitle", "COMPLEJO 07  /  OPERACIÓN COOPERATIVA", UDim2.fromOffset(390, 22), UDim2.fromOffset(28, 70), 10, C.Muted)
	local wave = frame(self.root, "WavePanel", UDim2.fromOffset(280, 72), UDim2.new(0.5, -140, 0, 38), C.Background, 0.1)
	outline(wave)
	self.roundLabel = label(wave, "Round", "RONDA 00", UDim2.new(1, -24, 0, 30), UDim2.fromOffset(12, 8), 21)
	self.roundLabel.TextXAlignment = Enum.TextXAlignment.Center
	self.waveLabel = label(wave, "Phase", "CONECTANDO…", UDim2.new(1, -24, 0, 20), UDim2.fromOffset(12, 42), 11, C.Accent)
	self.waveLabel.TextXAlignment = Enum.TextXAlignment.Center
	self.moneyLabel = label(self.root, "Credits", "$ —", UDim2.fromOffset(190, 32), UDim2.new(1, -218, 0, 42), 24, C.Accent)
	self.moneyLabel.TextXAlignment = Enum.TextXAlignment.Right
	local moneySub = label(self.root, "CreditsCaption", "CRÉDITOS DE OPERACIÓN", UDim2.fromOffset(190, 20), UDim2.new(1, -218, 0, 76), 10, C.Muted)
	moneySub.TextXAlignment = Enum.TextXAlignment.Right
	local health = frame(self.root, "HealthPanel", UDim2.fromOffset(242, 90), UDim2.new(0, 28, 1, -138), C.Background, 0.1)
	outline(health)
	label(health, "Caption", "ESTADO VITAL", UDim2.fromOffset(160, 20), UDim2.fromOffset(14, 9), 11, C.Muted)
	self.healthLabel = label(health, "Value", "— / 100", UDim2.fromOffset(210, 30), UDim2.fromOffset(14, 27), 23)
	local healthBack = frame(health, "Bar", UDim2.new(1, -28, 0, 5), UDim2.fromOffset(14, 66), C.Line)
	self.healthFill = frame(healthBack, "Fill", UDim2.fromScale(1, 1), nil, C.Accent)
	self.stanceLabel = label(self.root, "Stance", "EN PIE", UDim2.fromOffset(220, 20), UDim2.new(0, 30, 1, -42), 10, C.Muted)
	local ammo = frame(self.root, "AmmoPanel", UDim2.fromOffset(258, 106), UDim2.new(1, -286, 1, -154), C.Background, 0.1)
	outline(ammo)
	self.weaponLabel = label(ammo, "Weapon", "ASIGNANDO ARMA…", UDim2.fromOffset(226, 20), UDim2.fromOffset(16, 11), 12, C.Accent)
	self.ammoLabel = label(ammo, "Ammo", "— / —", UDim2.fromOffset(226, 42), UDim2.fromOffset(16, 33), 32)
	self.reloadLabel = label(ammo, "Reload", "", UDim2.fromOffset(226, 18), UDim2.fromOffset(16, 79), 10, C.Muted)
	local reloadBack = frame(ammo, "ReloadTrack", UDim2.new(1, -32, 0, 3), UDim2.fromOffset(16, 100), C.Line)
	self.reloadFill = frame(reloadBack, "Fill", UDim2.fromScale(0, 1), nil, C.Amber)
	self.controls = label(self.root, "Controls", "WASD  MOVER    SHIFT  SPRINT    C  AGACHARSE    ESPACIO  SALTAR    RMB  MIRA    R  RECARGAR    E  ARSENAL", UDim2.new(1, -570, 0, 38), UDim2.new(0, 285, 1, -48), 10, C.Muted)
	self.controls.TextXAlignment, self.controls.TextWrapped = Enum.TextXAlignment.Center, true
	self.crosshair = frame(self.root, "Crosshair", UDim2.fromOffset(36, 36), UDim2.new(0.5, -18, 0.5, -18), C.Background, 1)
	self.crosshairLines = {}
	for _, spec in {{2, 7, 17, 0}, {2, 7, 17, 29}, {7, 2, 0, 17}, {7, 2, 29, 17}} do
		table.insert(self.crosshairLines, frame(self.crosshair, "Tick", UDim2.fromOffset(spec[1], spec[2]), UDim2.fromOffset(spec[3], spec[4]), C.Text, 0.25))
	end
	frame(self.crosshair, "Dot", UDim2.fromOffset(2, 2), UDim2.fromOffset(17, 17), C.Text, 0.2)
	self.hit = frame(self.root, "Hitmarker", UDim2.fromOffset(34, 34), UDim2.new(0.5, -17, 0.5, -17), C.Background, 1)
	self.hit.Visible = false
	for _, spec in {{7, 7, -45}, {25, 7, 45}, {7, 25, 45}, {25, 25, -45}} do
		local line = frame(self.hit, "HitLine", UDim2.fromOffset(2, 9), UDim2.fromOffset(spec[1], spec[2]), C.Text)
		line.AnchorPoint, line.Rotation = Vector2.new(0.5, 0.5), spec[3]
	end
	self.killLabel = label(self.root, "Kill", "", UDim2.fromOffset(250, 24), UDim2.new(0.5, -125, 0.5, 32), 11, C.Accent)
	self.killLabel.TextXAlignment = Enum.TextXAlignment.Center
	self.notice = label(self.root, "Notice", "CONECTANDO CON EL SERVIDOR…", UDim2.new(0.8, 0, 0, 42), UDim2.fromScale(0.1, 0.23), 16, C.Amber)
	self.notice.TextXAlignment, self.notice.TextWrapped = Enum.TextXAlignment.Center, true
	self.death = label(self.root, "Death", "", UDim2.new(0.8, 0, 0, 100), UDim2.fromScale(0.1, 0.38), 23, C.Text)
	self.death.TextXAlignment, self.death.TextWrapped = Enum.TextXAlignment.Center, true
	self.damageEdges = {}
	for _, spec in {{UDim2.new(1, 0, 0, 12), UDim2.new()}, {UDim2.new(1, 0, 0, 12), UDim2.new(0, 0, 1, -12)}, {UDim2.new(0, 12, 1, 0), UDim2.new()}, {UDim2.new(0, 12, 1, 0), UDim2.new(1, -12, 0, 0)}} do
		local edge = frame(self.root, "DamageEdge", spec[1], spec[2], C.Red, 1)
		table.insert(self.damageEdges, edge)
	end
	self:BuildArsenal()
	if UserInputService.TouchEnabled then self:BuildTouchControls() end
end

function HUDController:BuildArsenal()
	local overlay = Instance.new("TextButton")
	overlay.Name, overlay.Size, overlay.Text = "ArsenalOverlay", UDim2.fromScale(1, 1), ""
	overlay.BackgroundColor3, overlay.BackgroundTransparency = Color3.new(), 0.2
	overlay.AutoButtonColor, overlay.Modal, overlay.Visible, overlay.Parent = false, true, false, self.gui
	self.overlay = overlay
	local panel = frame(overlay, "Arsenal", UDim2.fromOffset(920, 590), UDim2.fromScale(0.5, 0.5), C.Background)
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	outline(panel)
	self.arsenalScale = Instance.new("UIScale")
	self.arsenalScale.Parent = panel
	label(panel, "Title", "ARSENAL  /  ESTACIÓN 07", UDim2.fromOffset(620, 38), UDim2.fromOffset(24, 16), 23, C.Accent)
	self.arsenalMoney = label(panel, "Credits", "$ 0", UDim2.fromOffset(185, 32), UDim2.fromOffset(650, 18), 23, C.Accent)
	self.arsenalMoney.TextXAlignment = Enum.TextXAlignment.Right
	local close = button(panel, "Close", "×", UDim2.fromOffset(42, 38), UDim2.fromOffset(852, 17))
	table.insert(self.connections, close.Activated:Connect(function() self:CloseArsenal() end))
	label(panel, "Caption", "EQUIPA. MEJORA. RESISTE.   /   LAS MEJORAS SE APLICAN POR ARMA.", UDim2.fromOffset(870, 24), UDim2.fromOffset(24, 58), 11, C.Muted)
	frame(panel, "Separator", UDim2.fromOffset(872, 1), UDim2.fromOffset(24, 96), C.Line)
	label(panel, "InventoryCaption", "PLATAFORMAS DISPONIBLES", UDim2.fromOffset(260, 24), UDim2.fromOffset(24, 108), 11, C.Muted)
	self.weaponButtons = {}
	for index, id in self.ctx.WeaponConfig.Order do
		local pick = button(panel, id, "", UDim2.fromOffset(258, 92), UDim2.fromOffset(24, 143 + (index - 1) * 104))
		pick.TextXAlignment = Enum.TextXAlignment.Left
		pick.TextWrapped = true
		local padding = Instance.new("UIPadding")
		padding.PaddingLeft, padding.PaddingRight, padding.Parent = UDim.new(0, 14), UDim.new(0, 10), pick
		self.weaponButtons[id] = pick
		table.insert(self.connections, pick.Activated:Connect(function()
			if not self.pending then self.selected = id; self:RefreshArsenal() end
		end))
	end
	label(panel, "Safety", "Mantente junto a la estación.\nEl combate continúa mientras compras.", UDim2.fromOffset(258, 66), UDim2.fromOffset(24, 463), 12, C.Amber).TextWrapped = true
	self.arsenalName = label(panel, "WeaponName", "", UDim2.fromOffset(560, 35), UDim2.fromOffset(310, 109), 24)
	self.arsenalStats = label(panel, "Stats", "", UDim2.fromOffset(572, 48), UDim2.fromOffset(310, 148), 12, C.Muted)
	self.arsenalStats.TextWrapped = true
	self.buyButton = button(panel, "BuyEquip", "", UDim2.fromOffset(272, 43), UDim2.fromOffset(310, 211))
	self.ammoButton = button(panel, "Ammo", "", UDim2.fromOffset(284, 43), UDim2.fromOffset(598, 211))
	table.insert(self.connections, self.buyButton.Activated:Connect(function()
		local state = self.ctx.State
		if state then self:Request(state.inventory[self.selected] and "Equip" or "Buy", self.selected) end
	end))
	table.insert(self.connections, self.ammoButton.Activated:Connect(function() self:Request("Ammo", self.selected) end))
	label(panel, "UpgradeCaption", "MEJORAS MODULARES", UDim2.fromOffset(570, 24), UDim2.fromOffset(310, 271), 11, C.Muted)
	self.upgradeButtons = {}
	for index, key in self.ctx.WeaponConfig.UpgradeOrder do
		local row = frame(panel, key, UDim2.fromOffset(572, 49), UDim2.fromOffset(310, 304 + (index - 1) * 56), C.Panel)
		outline(row)
		local title = label(row, "Title", "", UDim2.fromOffset(320, 42), UDim2.fromOffset(12, 3), 13)
		local upgrade = button(row, "Upgrade", "", UDim2.fromOffset(216, 33), UDim2.fromOffset(345, 8))
		self.upgradeButtons[key] = {title = title, button = upgrade}
		table.insert(self.connections, upgrade.Activated:Connect(function() self:Request("Upgrade", self.selected, key) end))
	end
	self.arsenalStatus = label(panel, "Status", "ESC / B  VOLVER AL COMBATE", UDim2.fromOffset(872, 42), UDim2.fromOffset(24, 542), 12, C.Muted)
	self.arsenalStatus.TextWrapped = true
end

function HUDController:SetButtonState(item, enabled)
	item.Active, item.AutoButtonColor, item.Selectable = enabled, enabled, enabled
	item:SetAttribute("Enabled", enabled)
	item.BackgroundColor3, item.TextColor3 = enabled and C.Accent or C.Panel, enabled and C.Background or C.Muted
end

function HUDController:RefreshArsenal()
	local state = self.ctx.State
	if not state then return end
	local config = self.ctx.WeaponConfig
	local selected = config.Weapons[self.selected]
	if not selected then self.selected = state.equipped; selected = config.Weapons[self.selected] end
	local owned = state.inventory[self.selected]
	local stats = config.GetStats(self.selected, owned and owned.levels)
	self.arsenalMoney.Text = money(state.money)
	for id, item in pairs(self.weaponButtons) do
		local base = config.Weapons[id]
		local status = id == state.equipped and "EQUIPADA" or (state.inventory[id] and "EN INVENTARIO" or money(base.Price))
		item.Text = base.Name .. "\n\n" .. status
		item.BackgroundColor3 = id == self.selected and C.Accent or C.Panel
		item.TextColor3 = id == self.selected and C.Background or C.Text
		item.Active, item.AutoButtonColor = not self.pending, not self.pending
	end
	self.arsenalName.Text = selected.Name
	self.arsenalStats.Text = string.format("DAÑO %.0f    •    CARGADOR %d    •    RECARGA %.2f s\nRESERVA %d    •    CONTROL %.2f    •    %s", stats.Damage, stats.MagazineSize, stats.ReloadTime, stats.MaxReserve, stats.Recoil, stats.Automatic and "AUTOMÁTICA" or "SEMIAUTOMÁTICA")
	self.buyButton.Text = owned and (state.equipped == self.selected and "EQUIPADA" or "EQUIPAR ARMA") or ("COMPRAR  /  " .. money(selected.Price))
	self:SetButtonState(self.buyButton, not self.pending and ((owned and state.equipped ~= self.selected) or (not owned and state.money >= selected.Price)))
	self.ammoButton.Text = "REABASTECER  /  " .. money(selected.AmmoPrice)
	self:SetButtonState(self.ammoButton, not self.pending and owned ~= nil and owned.reserve < stats.MaxReserve and state.money >= selected.AmmoPrice)
	for key, item in pairs(self.upgradeButtons) do
		local level = owned and owned.levels[key] or 0
		local definition = config.Upgrades[key]
		local price = config.GetUpgradePrice(key, level)
		item.title.Text = string.format("%s  /  NIVEL %d DE %d", definition.Name:upper(), level, definition.MaxLevel)
		item.button.Text = price and ("MEJORAR  " .. money(price)) or "NIVEL MÁXIMO"
		self:SetButtonState(item.button, not self.pending and owned ~= nil and price ~= nil and state.money >= (price or math.huge))
	end
end

function HUDController:Request(action, weaponId, key)
	if not self.open or self.pending then return end
	local target = action == "Upgrade" and self.upgradeButtons[key].button or (action == "Ammo" and self.ammoButton or self.buyButton)
	if not target:GetAttribute("Enabled") then return end
	self.pending = true
	self.requestGeneration += 1
	local generation = self.requestGeneration
	self.arsenalStatus.Text, self.arsenalStatus.TextColor3 = "PROCESANDO SOLICITUD…", C.Amber
	self:RefreshArsenal()
	task.delay((self.ctx.Config.Client or {}).RequestTimeout or 8, function()
		if not self.started or generation ~= self.requestGeneration or not self.pending then return end
		self.pending = false
		self.requestGeneration += 1
		self.arsenalStatus.Text, self.arsenalStatus.TextColor3 = "Sin respuesta. Espera a que se restablezca la conexión.", C.Red
		self:RefreshArsenal()
	end)
	task.spawn(function()
		local ok, result = pcall(function() return self.ctx.Remotes.ArsenalRequest:InvokeServer(action, weaponId, key) end)
		if not self.started or generation ~= self.requestGeneration then return end
		self.pending = false
		local success = ok and type(result) == "table" and result.ok
		self.arsenalStatus.Text = ok and type(result) == "table" and tostring(result.message or "Solicitud completada.") or "No se pudo contactar con el Arsenal."
		self.arsenalStatus.TextColor3 = success and C.Accent or C.Red
		if success then self.ctx.Weapons:PlaySound("Purchase", 0.25) end
		self:RefreshArsenal()
		self.ctx.RequestState()
	end)
end

function HUDController:FindTerminal()
	local world = workspace:FindFirstChild(self.ctx.Config.World.Name)
	for _, descendant in (world or workspace):GetDescendants() do
		if descendant:IsA("BasePart") and (descendant:GetAttribute("ArsenalTerminal") or descendant.Name == "ArsenalPart" or descendant.Name == "ArsenalTerminal") then return descendant end
	end
	return nil
end

function HUDController:OpenArsenal()
	if not self.ctx.State or not self.ctx.State.alive then return end
	self.terminal = self:FindTerminal()
	self.open, self.overlay.Visible = true, true
	self.selected = self.ctx.State.equipped
	self.arsenalStatus.Text, self.arsenalStatus.TextColor3 = "ESC / B  VOLVER AL COMBATE", C.Muted
	self.ctx.FirstPerson:SetMenu(true)
	self:RefreshArsenal()
	if UserInputService.GamepadEnabled then GuiService.SelectedObject = self.weaponButtons[self.selected] end
end

function HUDController:CloseArsenal()
	self.open, self.overlay.Visible = false, false
	self.ctx.FirstPerson:SetMenu(false)
	GuiService.SelectedObject = nil
end

function HUDController:Notify(message)
	self.notice.Text, self.noticeUntil = tostring(message), os.clock() + ((self.ctx.Config.Client or {}).NoticeDuration or 3)
end

function HUDController:Hitmarker(headshot, killed)
	self.hitUntil = os.clock() + self.ctx.Config.Combat.HitmarkerDuration
	for _, child in self.hit:GetChildren() do if child:IsA("Frame") then child.BackgroundColor3 = headshot and C.Amber or C.Text end end
	if killed then
		self.killUntil = os.clock() + 0.9
		self.killLabel.Text, self.killLabel.TextColor3 = headshot and "BAJA  /  HEADSHOT" or "BAJA CONFIRMADA", headshot and C.Amber or C.Accent
	end
end

function HUDController:UpdateAmmo()
	local state = self.ctx.State
	if not state then return end
	local magazine, reserve = self.ctx.Weapons:GetDisplayedAmmo()
	self.ammoLabel.Text = string.format("%02d  /  %03d", magazine, reserve)
	self.ammoLabel.TextColor3 = magazine <= math.ceil(state.stats.MagazineSize * 0.2) and C.Amber or C.Text
	self.weaponLabel.Text = state.stats.Name
end

function HUDController:OnState(state)
	if self.previousHealth and state.health < self.previousHealth then self.damageUntil = os.clock() + 0.65 end
	self.previousHealth = state.health
	self.moneyLabel.Text = money(state.money)
	self.healthLabel.Text = string.format("%03d / %d", math.ceil(state.health), state.maxHealth)
	self.healthFill.Size = UDim2.fromScale(math.clamp(state.health / math.max(1, state.maxHealth), 0, 1), 1)
	self.healthFill.BackgroundColor3 = state.health < state.maxHealth * 0.3 and C.Red or C.Accent
	if not state.alive and self.open then self:CloseArsenal() end
	self:UpdateAmmo()
	if self.open then self:RefreshArsenal() end
end

function HUDController:BuildTouchControls()
	self.controls.Visible = false
	local touch = frame(self.root, "TouchControls", UDim2.fromOffset(234, 142), UDim2.new(1, -250, 0.5, 40), nil, 1)
	local fire = button(touch, "Fire", "FUEGO", UDim2.fromOffset(98, 62), UDim2.fromOffset(136, 0))
	table.insert(self.connections, fire.InputBegan:Connect(function(input) if input.UserInputType == Enum.UserInputType.Touch then self.ctx.Weapons:SetTrigger(true) end end))
	table.insert(self.connections, fire.InputEnded:Connect(function(input) if input.UserInputType == Enum.UserInputType.Touch then self.ctx.Weapons:SetTrigger(false) end end))
	local ads = button(touch, "ADS", "MIRA", UDim2.fromOffset(98, 50), UDim2.fromOffset(136, 74))
	table.insert(self.connections, ads.Activated:Connect(function() self.ctx.FirstPerson:SetIntent("ADS", not self.ctx.FirstPerson.ads) end))
	for index, item in {{"R", function() self.ctx.Weapons:Reload() end}, {"SPRINT", function() self.ctx.FirstPerson:SetIntent("Sprint", not self.ctx.FirstPerson.sprinting) end}, {"AGACHAR", function() self.ctx.FirstPerson:SetIntent("Crouch", not self.ctx.FirstPerson.crouching) end}} do
		local control = button(touch, item[1], item[1], UDim2.fromOffset(98, 34), UDim2.fromOffset(20, (index - 1) * 45))
		table.insert(self.connections, control.Activated:Connect(item[2]))
	end
end

function HUDController:Start()
	if self.started then return end
	self.started = true
	self:Build()
	table.insert(self.connections, UserInputService.InputBegan:Connect(function(input)
		if self.open and (input.KeyCode == Enum.KeyCode.Escape or input.KeyCode == Enum.KeyCode.Tab or input.KeyCode == Enum.KeyCode.ButtonB) then self:CloseArsenal() end
	end))
	local elapsed = 0
	table.insert(self.connections, RunService.Heartbeat:Connect(function(dt)
		elapsed += dt
		if elapsed < 0.1 then return end
		elapsed = 0
		local now, state = os.clock(), self.ctx.State
		self.hit.Visible = now < self.hitUntil and not self.open
		self.killLabel.Visible = now < (self.killUntil or 0) and not self.open
		self.notice.Visible = not state or now < self.noticeUntil
		for _, edge in self.damageEdges do edge.BackgroundTransparency = 1 - math.clamp((self.damageUntil - now) / 0.65, 0, 0.65) end
		local phase = workspace:GetAttribute("WavePhase") or "Waiting"
		local round = workspace:GetAttribute("Round") or 0
		local remaining = workspace:GetAttribute("ZombiesRemaining") or 0
		local countdown = math.max(0, math.ceil((workspace:GetAttribute("NextWaveAt") or 0) - workspace:GetServerTimeNow()))
		self.roundLabel.Text = string.format("RONDA %02d", round)
		local descriptions = {Waiting = "ESPERANDO OPERADORES", Intermission = "PREPARACIÓN  /  " .. countdown .. " s", Active = "HOSTILES RESTANTES  /  " .. remaining, Defeat = "OPERACIÓN FALLIDA  /  REINICIO"}
		self.waveLabel.Text = descriptions[phase] or phase
		self.waveLabel.TextColor3 = phase == "Defeat" and C.Red or C.Accent
		if state then
			self.death.Text = not state.alive and (phase == "Defeat" and "OPERACIÓN FALLIDA\nPreparando una nueva incursión…" or "OPERADOR CAÍDO\nRegresas al finalizar la oleada.") or ""
			self.crosshair.Visible = state.alive and not self.open
			for _, line in self.crosshairLines do line.Visible = not self.ctx.FirstPerson.ads end
			local fp = self.ctx.FirstPerson
			self.stanceLabel.Text = fp.sprinting and "SPRINT" or (fp.crouching and "AGACHADO" or (fp.ads and "APUNTANDO" or "EN PIE"))
			local predicted = self.ctx.Weapons.reloadPredictedUntil > now
			local reloading = state.reloading or predicted
			local remainingReload = state.reloading and math.max(0, state.reloadEndsAt - workspace:GetServerTimeNow()) or math.max(0, self.ctx.Weapons.reloadPredictedUntil - now)
			self.reloadLabel.Text = reloading and string.format("RECARGANDO  %.1f s", remainingReload) or "R  RECARGAR   /   RMB  MIRA"
			self.reloadFill.Size = UDim2.fromScale(reloading and math.clamp(1 - remainingReload / state.stats.ReloadTime, 0, 1) or 0, 1)
		end
		local camera = workspace.CurrentCamera
		if camera then self.arsenalScale.Scale = math.min(1, (camera.ViewportSize.X - 24) / 920, (camera.ViewportSize.Y - 40) / 590) end
		if self.open then
			local character = Players.LocalPlayer.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if not root or not self.terminal or not self.terminal.Parent or (root.Position - self.terminal.Position).Magnitude > self.ctx.Config.Arsenal.Range then
				self:CloseArsenal()
				self:Notify("Te alejaste del Arsenal.")
			end
		end
	end))
end

function HUDController:Destroy()
	self.started = false
	self.requestGeneration += 1
	for _, connection in self.connections do connection:Disconnect() end
	if self.gui then self.gui:Destroy() end
end

return HUDController
