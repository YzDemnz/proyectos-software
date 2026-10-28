--!nonstrict
-- Camera and intent only; the server owns movement limits and combat eligibility.
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local GuiService = game:GetService("GuiService")

local FirstPersonController = {}
FirstPersonController.__index = FirstPersonController

function FirstPersonController.new(ctx)
	return setmetatable({ctx = ctx, connections = {}, menu = false, ads = false, sprinting = false,
		crouching = false, recoil = Vector2.zero, appliedRecoil = Vector2.zero, elapsed = 0,
		offset = Vector3.zero, started = false, bindName = "BastionFirstPerson"}, FirstPersonController)
end

function FirstPersonController:SetIntent(key, enabled)
	local field = ({ADS = "ads", Sprint = "sprinting", Crouch = "crouching"})[key]
	if not field then return end
	if self.menu or not self.ctx.State or not self.ctx.State.alive then enabled = false end
	if self[field] == enabled then return end
	self[field] = enabled
	self.ctx.Remotes.WeaponAction:FireServer(key, enabled)
	if key == "ADS" and enabled then self:SetIntent("Sprint", false) end
	if key == "Sprint" and enabled then self:SetIntent("ADS", false) end
end

function FirstPersonController:ReleaseInputs()
	self:SetIntent("ADS", false)
	self:SetIntent("Sprint", false)
	if self.ctx.Weapons then self.ctx.Weapons:SetTrigger(false) end
end

function FirstPersonController:SetMenu(open)
	self.menu = open
	if open then self:ReleaseInputs() end
	UserInputService.MouseIconEnabled = open
	UserInputService.MouseBehavior = open and Enum.MouseBehavior.Default or Enum.MouseBehavior.LockCenter
end

function FirstPersonController:AddRecoil(amount)
	local scale = self.ctx.Config.Movement.RecoilCameraScale
	self.recoil += Vector2.new(math.rad(amount) * scale, math.rad((math.random() - 0.5) * amount * 0.35))
end

function FirstPersonController:OnState(state)
	self.ads, self.sprinting, self.crouching = state.ads, state.sprinting, state.crouching
	if not state.alive then
		self:ReleaseInputs()
		self:SetIntent("Crouch", false)
	end
end

function FirstPersonController:Start()
	if self.started then return end
	self.started = true
	local player = Players.LocalPlayer
	self.originalCameraMode = player.CameraMode
	self.originalMouseIcon = UserInputService.MouseIconEnabled
	player.CameraMode = Enum.CameraMode.LockFirstPerson
	UserInputService.MouseIconEnabled = false
	table.insert(self.connections, player.CharacterAdded:Connect(function()
		self.recoil, self.appliedRecoil = Vector2.zero, Vector2.zero
		self.offset = Vector3.zero
		self.crouching, self.ads, self.sprinting = false, false, false
	end))
	table.insert(self.connections, UserInputService.InputBegan:Connect(function(input, processed)
		if processed or self.menu or UserInputService:GetFocusedTextBox() then return end
		if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.ButtonL3 then
			self:SetIntent("Sprint", true)
		elseif input.KeyCode == Enum.KeyCode.C or input.KeyCode == Enum.KeyCode.LeftControl or input.KeyCode == Enum.KeyCode.ButtonB then
			self:SetIntent("Crouch", not self.crouching)
		elseif input.UserInputType == Enum.UserInputType.MouseButton2 or input.KeyCode == Enum.KeyCode.ButtonL2 then
			self:SetIntent("ADS", true)
		end
	end))
	table.insert(self.connections, UserInputService.InputEnded:Connect(function(input)
		if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.ButtonL3 then
			self:SetIntent("Sprint", false)
		elseif input.UserInputType == Enum.UserInputType.MouseButton2 or input.KeyCode == Enum.KeyCode.ButtonL2 then
			self:SetIntent("ADS", false)
		end
	end))
	table.insert(self.connections, UserInputService.WindowFocusReleased:Connect(function() self:ReleaseInputs() end))
	table.insert(self.connections, GuiService.MenuOpened:Connect(function()
		self.systemMenu = true
		self:ReleaseInputs()
	end))
	table.insert(self.connections, GuiService.MenuClosed:Connect(function() self.systemMenu = false end))
	table.insert(self.connections, UserInputService.TextBoxFocused:Connect(function() self:ReleaseInputs() end))
	RunService:BindToRenderStep(self.bindName, Enum.RenderPriority.Camera.Value + 1, function(dt)
		local camera = workspace.CurrentCamera
		if not camera then return end
		dt = math.min(dt, 0.1)
		local movement = self.ctx.Config.Movement
		local state = self.ctx.State
		local alive = state and state.alive
		local targetFOV = self.ads and movement.ADSFOV or (self.sprinting and movement.SprintFOV or movement.CameraFOV)
		camera.FieldOfView += (targetFOV - camera.FieldOfView) * (1 - math.exp(-movement.CameraResponse * dt))
		self.recoil *= math.exp(-movement.RecoilReturn * dt)
		local recoilDelta = self.recoil - self.appliedRecoil
		self.appliedRecoil = self.recoil
		if alive and not self.menu then camera.CFrame *= CFrame.Angles(recoilDelta.X, recoilDelta.Y, 0) end
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			self.elapsed += dt * movement.BobFrequency * (self.sprinting and 1.35 or 1)
			local moving = alive and humanoid.MoveDirection.Magnitude > 0.1 and humanoid.FloorMaterial ~= Enum.Material.Air
			local bob = moving and math.sin(self.elapsed * 2) * movement.BobAmount * (self.ads and 0.25 or 1) or 0
			local targetOffset = Vector3.new(0, (self.crouching and movement.CrouchCameraOffset or 0) + bob, 0)
			self.offset = self.offset:Lerp(targetOffset, 1 - math.exp(-movement.CameraResponse * dt))
			humanoid.CameraOffset = self.offset
		end
		local freeMouse = self.menu or self.systemMenu or UserInputService:GetFocusedTextBox() ~= nil
		UserInputService.MouseBehavior = freeMouse and Enum.MouseBehavior.Default or Enum.MouseBehavior.LockCenter
		UserInputService.MouseIconEnabled = freeMouse
	end)
end

function FirstPersonController:Destroy()
	RunService:UnbindFromRenderStep(self.bindName)
	for _, connection in self.connections do connection:Disconnect() end
	local player = Players.LocalPlayer
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if humanoid then humanoid.CameraOffset = Vector3.zero end
	if self.originalCameraMode then player.CameraMode = self.originalCameraMode end
	UserInputService.MouseIconEnabled = self.originalMouseIcon ~= false
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	self.started = false
end

return FirstPersonController
