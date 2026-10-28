--!nonstrict
-- Local presentation/prediction. No client raycast or client damage is trusted.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Debris = game:GetService("Debris")
local SoundService = game:GetService("SoundService")
local WeaponVisualAdapter = require(script.Parent:WaitForChild("WeaponVisualAdapter"))

local WeaponSystem = {}
WeaponSystem.__index = WeaponSystem

local function cosmeticPart(name, size, color, parent)
	local part = Instance.new("Part")
	part.Name, part.Size, part.Color = name, size, color
	part.Anchored, part.CanCollide, part.CanTouch, part.CanQuery, part.CastShadow = true, false, false, false, false
	part.Material = Enum.Material.Metal
	part.Parent = parent
	return part
end

function WeaponSystem.new(ctx)
	return setmetatable({ctx = ctx, connections = {}, pending = {}, nextShotId = 0,
		trigger = false, nextFire = 0, kick = 0, flashUntil = 0, equipAt = 0,
		reloadPredictedUntil = 0, sway = Vector2.zero, started = false, lastEmpty = 0}, WeaponSystem)
end

function WeaponSystem:PlaySound(key, volume, parent)
	local asset = self.ctx.Config.Audio[key]
	if not asset or asset == "" then return end
	local sound = Instance.new("Sound")
	sound.SoundId, sound.Volume = asset, volume or 0.25
	sound.PlaybackSpeed = key == "Fire" and (1.45 + math.random() * 0.12) or 1
	sound.RollOffMaxDistance = self.ctx.Config.Combat.MaxFXDistance
	sound.Parent = parent or SoundService
	sound:Play()
	Debris:AddItem(sound, 4)
end

function WeaponSystem:BuildViewmodel(weaponId)
	if self.model then self.model:Destroy() end
	self.model = Instance.new("Model")
	self.model.Name = "BastionViewmodel"
	self.model.Parent = workspace.CurrentCamera
	self.parts = {}
	local config = self.ctx.WeaponConfig.Weapons[weaponId]
	local color = Color3.new(unpack(config.Color))
	local dark = Color3.fromRGB(22, 25, 27)
	local function add(name, size, offset, tint)
		local part = cosmeticPart(name, size, tint or color, self.model)
		table.insert(self.parts, {part = part, offset = offset, name = name})
		return part
	end
	local short = weaponId == "SMG"
	local long = weaponId == "DMR"
	local visual = WeaponVisualAdapter.Load(weaponId, self.model)
	self.visual = visual
	if visual then
		for _, item in visual.parts do table.insert(self.parts, item) end
	else
	add("Receiver", Vector3.new(0.25, 0.3, 0.8), CFrame.new())
	add("UpperRail", Vector3.new(0.2, 0.06, 0.95), CFrame.new(0, 0.185, -0.08), dark)
	add("Handguard", Vector3.new(0.23, 0.26, short and 0.45 or 0.8), CFrame.new(0, -0.015, short and -0.55 or -0.7))
	add("Barrel", Vector3.new(0.075, 0.075, long and 0.9 or 0.45), CFrame.new(0, 0.04, long and -1.45 or -1.16), dark)
	add("Muzzle", Vector3.new(0.115, 0.115, 0.2), CFrame.new(0, 0.04, long and -1.92 or -1.43), dark)
	add("Stock", Vector3.new(0.18, 0.26, 0.6), CFrame.new(0, -0.015, 0.7), dark)
	add("Grip", Vector3.new(0.2, 0.37, 0.2), CFrame.new(0, -0.28, 0.22) * CFrame.Angles(-0.2, 0, 0), dark)
	add("Magazine", Vector3.new(0.19, 0.48, 0.25), CFrame.new(0, -0.32, -0.19) * CFrame.Angles(-0.1, 0, 0), dark)
	add("RearSightL", Vector3.new(0.035, 0.14, 0.06), CFrame.new(-0.062, 0.28, 0.23), dark)
	add("RearSightR", Vector3.new(0.035, 0.14, 0.06), CFrame.new(0.062, 0.28, 0.23), dark)
	local post = add("FrontSight", Vector3.new(0.035, 0.1, 0.05), CFrame.new(0, 0.28, short and -0.68 or -1.03), Color3.fromRGB(175, 231, 193))
	post.Material = Enum.Material.Neon
	end
	local rightGrip = visual and visual.attachments.Grip or CFrame.new(0.04, -0.24, 0.21)
	local leftGrip = visual and visual.attachments.SupportGrip or CFrame.new(-0.05, -0.22, -0.46)
	add("RightSleeve", Vector3.new(0.28, 0.32, 0.75), rightGrip * CFrame.new(0.18, -0.15, 0.47) * CFrame.Angles(-0.3, -0.25, 0), color)
	add("RightGlove", Vector3.new(0.24, 0.29, 0.3), rightGrip * CFrame.new(0.02, -0.02, 0.02), dark)
	add("LeftSleeve", Vector3.new(0.27, 0.3, 0.75), leftGrip * CFrame.new(-0.28, -0.22, 0.68) * CFrame.Angles(-0.3, -0.6, -0.1), color)
	add("LeftGlove", Vector3.new(0.28, 0.2, 0.27), leftGrip, dark)
	local muzzle = visual and visual.attachments.Muzzle * CFrame.new(0, 0, -0.08)
		or CFrame.new(0, 0.04, long and -2.09 or -1.6)
	self.flash = add("MuzzleFlash", Vector3.new(0.2, 0.2, 0.3), muzzle, Color3.fromRGB(255, 218, 148))
	self.flash.Material, self.flash.Transparency = Enum.Material.Neon, 1
	self.light = Instance.new("PointLight")
	self.light.Color, self.light.Brightness, self.light.Range, self.light.Enabled = self.flash.Color, 2, 9, false
	self.light.Parent = self.flash
	self.equipAt, self.weaponId = os.clock(), weaponId
end

function WeaponSystem:GetDisplayedAmmo()
	local state = self.ctx.State
	if not state then return 0, 0 end
	local owned = state.inventory[state.equipped]
	if not owned then return 0, 0 end
	local count = 0
	for _, shot in pairs(self.pending) do if shot.weaponId == state.equipped then count += 1 end end
	return math.max(0, owned.magazine - count), owned.reserve
end

function WeaponSystem:OnState(state)
	self.nextShotId = math.max(self.nextShotId, state.lastShotId or 0)
	for shotId, shot in pairs(self.pending) do
		if shotId <= (state.lastShotId or 0) or shot.weaponId ~= state.equipped or not state.alive then self.pending[shotId] = nil end
	end
	if self.weaponId ~= state.equipped then
		self:BuildViewmodel(state.equipped)
		self.nextFire, self.reloadPredictedUntil = 0, 0
	end
	if state.reloading or not state.alive then self.reloadPredictedUntil = 0 end
	if not state.alive then self:SetTrigger(false) end
end

function WeaponSystem:SetTrigger(pressed)
	local firstPerson = self.ctx.FirstPerson
	if firstPerson.menu or firstPerson.systemMenu or not self.ctx.State or not self.ctx.State.alive then pressed = false end
	local began = pressed and not self.trigger
	self.trigger = pressed
	if began then self:TryFire() end
end

function WeaponSystem:Reload()
	local state = self.ctx.State
	if not state or not state.alive or self.ctx.FirstPerson.menu or state.reloading or self.reloadPredictedUntil > os.clock() then return end
	local magazine, reserve = self:GetDisplayedAmmo()
	if reserve <= 0 or magazine >= state.stats.MagazineSize then return end
	self.ctx.FirstPerson:SetIntent("Sprint", false)
	self.ctx.FirstPerson:SetIntent("ADS", false)
	self.reloadPredictedAt = os.clock()
	self.reloadPredictedUntil = os.clock() + state.stats.ReloadTime
	self.ctx.Remotes.WeaponAction:FireServer("Reload")
	self:PlaySound("Reload", self.ctx.Config.Audio.ReloadVolume)
end

function WeaponSystem:TryFire()
	local state = self.ctx.State
	local fp = self.ctx.FirstPerson
	local now = os.clock()
	if not state or not state.alive or fp.menu or fp.systemMenu or fp.sprinting or state.sprinting or state.reloading or self.reloadPredictedUntil > now or now < self.nextFire then return end
	local magazine = self:GetDisplayedAmmo()
	if magazine <= 0 then
		if now - self.lastEmpty > 0.4 then self.lastEmpty = now; self:PlaySound("Empty", 0.18) end
		self:Reload()
		return
	end
	local count = 0
	for _ in pairs(self.pending) do count += 1 end
	if count >= ((self.ctx.Config.Client or {}).MaxPendingShots or 16) then return end
	local camera = workspace.CurrentCamera
	if not camera then return end
	self.nextShotId += 1
	if self.nextShotId > self.ctx.Config.Combat.MaxShotId then return end
	self.pending[self.nextShotId] = {time = now, weaponId = state.equipped}
	self.nextFire = now + state.stats.FireInterval
	self.ctx.Remotes.WeaponFire:FireServer(self.nextShotId, camera.CFrame.Position, camera.CFrame.LookVector)
	self.kick += state.stats.Recoil
	self.flashUntil = now + 0.045
	fp:AddRecoil(state.stats.Recoil)
	self:PlaySound("Fire", self.ctx.Config.Audio.FireVolume)
	self.ctx.HUD:UpdateAmmo()
end

function WeaponSystem:HandleFX(event)
	if type(event) ~= "table" then return end
	if event.kind == "Hit" then
		self.ctx.HUD:Hitmarker(event.headshot, event.killed)
		self:PlaySound("Hit", self.ctx.Config.Audio.HitVolume)
	elseif event.kind == "Notice" then
		self.ctx.HUD:Notify(event.message)
	elseif event.kind == "Shot" then
		if typeof(event.origin) ~= "Vector3" or typeof(event.position) ~= "Vector3" then return end
		local camera = workspace.CurrentCamera
		if not camera or (camera.CFrame.Position - event.origin).Magnitude > self.ctx.Config.Combat.MaxFXDistance then return end
		local delta = event.position - event.origin
		if delta.Magnitude < 0.01 then return end
		local start = event.origin
		if event.userId == Players.LocalPlayer.UserId and self.flash then start = self.flash.Position end
		local visualDistance = (event.position - start).Magnitude
		local tracer = cosmeticPart("BastionTracer", Vector3.new(0.025, 0.025, visualDistance), Color3.fromRGB(255, 206, 137), workspace)
		tracer.Material, tracer.Transparency = Enum.Material.Neon, 0.35
		tracer.CFrame = CFrame.lookAt(start, event.position) * CFrame.new(0, 0, -visualDistance / 2)
		Debris:AddItem(tracer, self.ctx.Config.Combat.TracerLifetime)
		local spark = cosmeticPart("BastionImpact", Vector3.new(0.09, 0.09, 0.09), Color3.fromRGB(255, 230, 190), workspace)
		spark.Material, spark.Position = Enum.Material.Neon, event.position
		Debris:AddItem(spark, self.ctx.Config.Combat.ImpactLifetime)
		if event.userId ~= Players.LocalPlayer.UserId then
			local emitter = cosmeticPart("BastionShotAudio", Vector3.new(0.1, 0.1, 0.1), Color3.new(), workspace)
			emitter.Position, emitter.Transparency = event.origin, 1
			self:PlaySound("Fire", self.ctx.Config.Audio.FireVolume, emitter)
			Debris:AddItem(emitter, 4)
		end
	end
end

function WeaponSystem:Start()
	if self.started then return end
	self.started = true
	table.insert(self.connections, UserInputService.InputBegan:Connect(function(input, processed)
		if processed or UserInputService:GetFocusedTextBox() then return end
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.KeyCode == Enum.KeyCode.ButtonR2 then self:SetTrigger(true)
		elseif input.KeyCode == Enum.KeyCode.R or input.KeyCode == Enum.KeyCode.ButtonX then self:Reload() end
	end))
	table.insert(self.connections, UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.KeyCode == Enum.KeyCode.ButtonR2 then self:SetTrigger(false) end
	end))
	table.insert(self.connections, RunService.Heartbeat:Connect(function()
		local expired = false
		for id, shot in pairs(self.pending) do
			if os.clock() - shot.time > ((self.ctx.Config.Client or {}).FireAckTimeout or 1.5) then self.pending[id] = nil; expired = true end
		end
		if expired then self.ctx.HUD:UpdateAmmo() end
		if self.trigger and self.ctx.State and self.ctx.State.stats.Automatic then self:TryFire() end
	end))
	RunService:BindToRenderStep("BastionViewmodel", Enum.RenderPriority.Camera.Value + 2, function(dt)
		local camera, state = workspace.CurrentCamera, self.ctx.State
		if not self.model or not camera or not state then return end
		if self.model.Parent ~= camera then self.model.Parent = camera end
		dt = math.min(dt, 0.1)
		local fp, cfg = self.ctx.FirstPerson, self.ctx.Config
		local hidden = not state.alive or fp.menu
		self.kick *= math.exp(-cfg.Movement.RecoilReturn * dt)
		local delta = UserInputService:GetMouseDelta()
		self.sway = self.sway:Lerp(Vector2.new(math.clamp(delta.X, -30, 30), math.clamp(delta.Y, -30, 30)), 1 - math.exp(-12 * dt))
		self.adsBlend = (self.adsBlend or 0) + ((fp.ads and not state.reloading and 1 or 0) - (self.adsBlend or 0)) * (1 - math.exp(-cfg.Movement.CameraResponse * dt))
		local ads = self.adsBlend
		local hipOffset = self.visual and self.visual.hipOffset or CFrame.new(0.57, -0.63, -1.35)
		local adsOffset = self.visual and self.visual.adsOffset or CFrame.new(0, -0.325, -1.24)
		local offset = hipOffset:Lerp(adsOffset, ads)
		local char = Players.LocalPlayer.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local moving = hum and hum.MoveDirection.Magnitude > 0.1 and hum.FloorMaterial ~= Enum.Material.Air
		local bob = moving and cfg.Movement.BobAmount * (1 - ads * 0.8) or 0
		local equipDuration = (cfg.Client or {}).EquipDuration or 0.35
		local equip = 1 - math.clamp((os.clock() - self.equipAt) / equipDuration, 0, 1)
		local reloadProgress = nil
		if state.reloading then reloadProgress = 1 - math.clamp((state.reloadEndsAt - workspace:GetServerTimeNow()) / state.stats.ReloadTime, 0, 1)
		elseif self.reloadPredictedUntil > os.clock() then reloadProgress = 1 - (self.reloadPredictedUntil - os.clock()) / state.stats.ReloadTime end
		local reload = reloadProgress and math.sin(reloadProgress * math.pi) or 0
		local sprint = fp.sprinting and 1 or 0
		local base = camera.CFrame * offset
			* CFrame.new(math.sin(fp.elapsed) * bob, math.cos(fp.elapsed * 2) * bob - equip * 0.7 - reload * 0.13, self.kick * ((cfg.Client or {}).RecoilKickback or 0.075))
			* CFrame.Angles(math.rad(self.kick * 2 - equip * 35 - sprint * 12), -self.sway.X * cfg.Movement.SwayAmount - sprint * 0.2, -self.sway.X * cfg.Movement.SwayAmount * 0.4 + reload * 0.65)
		for _, item in self.parts do
			local partOffset = item.offset
			if reloadProgress and (item.name == "Magazine" or item.name == "LeftGlove") then
				local extraction = math.sin(math.clamp((reloadProgress - 0.13) / 0.72, 0, 1) * math.pi)
				partOffset *= CFrame.new(-extraction * 0.15, -extraction * 0.7, extraction * 0.15) * CFrame.Angles(0, 0, -extraction * 0.2)
			end
			item.part.CFrame = base * partOffset
			item.part.LocalTransparencyModifier = hidden and 1 or 0
		end
		local flashing = not hidden and os.clock() < self.flashUntil
		self.flash.Transparency, self.light.Enabled = flashing and 0.1 or 1, flashing
	end)
end

function WeaponSystem:Destroy()
	RunService:UnbindFromRenderStep("BastionViewmodel")
	for _, connection in self.connections do connection:Disconnect() end
	if self.model then self.model:Destroy() end
	self.pending, self.started = {}, false
end

return WeaponSystem
