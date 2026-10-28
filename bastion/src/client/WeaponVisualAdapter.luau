--!nonstrict
-- Creator Store models are inert geometry. This adapter never requires asset code,
-- creates remotes, or participates in aiming/raycast/damage decisions.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local bastion = ReplicatedStorage:WaitForChild("Bastion")
local Config = require(bastion:WaitForChild("Shared"):WaitForChild("WeaponVisualConfig"))

local WeaponVisualAdapter = {}
local warned = {}
local attachmentAliases = {
	Grip = { "grip", "rightgrip", "grippoint" },
	SupportGrip = { "supportgrip", "leftgrip", "foregrip" },
	Muzzle = { "muzzle", "muzzleattachment", "gunfirepoint", "firepoint", "barrelattachment" },
	Magazine = { "magazine", "magazineattachment", "magattachment" },
	ADSSight = { "adssight", "aimpoint", "aimattachment", "cameraaim", "sightattachment" },
}

local function vector(values)
	return Vector3.new(values[1] or 0, values[2] or 0, values[3] or 0)
end

local function isVisual(instance)
	if instance:IsA("BasePart") then
		return not instance:IsA("Seat") and not instance:IsA("VehicleSeat") and not instance:IsA("SpawnLocation")
	end
	return instance:IsA("Model") or instance:IsA("Folder") or instance:IsA("Attachment")
		or instance:IsA("DataModelMesh") or instance:IsA("Decal")
		or instance:IsA("SurfaceAppearance")
end

local function magazinePart(part, model)
	local current = part
	while current and current ~= model do
		local name = string.lower(current.Name)
		if name == "mag" or string.match(name, "^mag[%s%p%d]")
			or string.find(name, "magazine", 1, true) or string.find(name, "clip", 1, true) then
			return true
		end
		current = current.Parent
	end
	return false
end

local function namedAttachment(model, name, definition)
	local requested = definition.AttachmentNames and definition.AttachmentNames[name]
	for _, item in model:GetDescendants() do
		if item:IsA("Attachment") and item.Parent and item.Parent:IsA("BasePart") then
			if requested and item.Name == requested then return item end
			if not requested then
				for _, alias in attachmentAliases[name] do
					if string.lower(item.Name) == alias then return item end
				end
			end
		end
	end
	return nil
end

local function prepare(model, definition)
	-- A second allowlist at the client boundary protects against later accidental
	-- imports containing scripts, tools, constraints, prompts, audio or emitters.
	local geometry = {}
	for _, item in model:GetDescendants() do
		if item:IsDescendantOf(model) then
			if not isVisual(item) then
				item:Destroy()
			elseif item:IsA("BasePart") then
				table.insert(geometry, item)
				item.Anchored = true
				item.CanCollide, item.CanTouch, item.CanQuery = false, false, false
				item.CastShadow, item.Massless = false, true
				item.AssemblyLinearVelocity, item.AssemblyAngularVelocity = Vector3.zero, Vector3.zero
				if item:IsA("MeshPart") then
					pcall(function() item.RenderFidelity = Enum.RenderFidelity.Performance end)
				end
			end
		end
	end
	assert(#geometry > 0 and #geometry <= Config.MaxPartCount, "visual geometry budget exceeded or empty")
	model.PrimaryPart = nil
	model.WorldPivot = CFrame.identity
	local bounds, size = model:GetBoundingBox()
	local length = math.max(size.X, size.Y, size.Z)
	assert(length >= Config.MinSourceLength and length < math.huge, "invalid visual bounds")
	local rotation
	if definition.RotationDegrees then
		local angles = vector(definition.RotationDegrees)
		rotation = CFrame.Angles(math.rad(angles.X), math.rad(angles.Y), math.rad(angles.Z))
	elseif size.X > size.Z and size.X >= size.Y then
		rotation = CFrame.Angles(0, math.pi / 2, 0)
	elseif size.Y > size.Z and size.Y > size.X then
		rotation = CFrame.Angles(-math.pi / 2, 0, 0)
	else
		rotation = CFrame.identity
	end
	local normalize = rotation * CFrame.new(-bounds.Position)
	for _, part in geometry do part.CFrame = normalize * part.CFrame end
	model.WorldPivot = CFrame.identity
	local scale = definition.TargetLength / length
	assert(scale > 0 and scale <= Config.MaxScaleFactor, "invalid visual scale")
	-- ScaleTo also scales SpecialMesh geometry, attachments and texture tiling.
	model:ScaleTo(model:GetScale() * scale)
	local _, normalizedSize = model:GetBoundingBox()
	local parts = {}
	for _, part in geometry do
		table.insert(parts, { part = part, offset = part.CFrame,
			name = magazinePart(part, model) and "Magazine" or "WeaponGeometry" })
	end
	local height, depth = normalizedSize.Y, normalizedSize.Z
	local defaults = {
		Grip = Vector3.new(0, -height * 0.2, depth * 0.2),
		SupportGrip = Vector3.new(0, -height * 0.16, -depth * 0.19),
		Muzzle = Vector3.new(0, height * 0.12, -depth / 2),
		Magazine = Vector3.new(0, -height * 0.27, 0),
		ADSSight = Vector3.new(0, height * 0.4, depth * 0.16),
	}
	local offsets = {}
	for name, position in defaults do
		local source = namedAttachment(model, name, definition)
		-- Authored marker rotation conventions differ. Canonical attachment forward
		-- always follows the normalized barrel (-Z); preserve marker positions only.
		if definition[name] then position = vector(definition[name])
		elseif source then position = source.WorldPosition end
		offsets[name] = CFrame.new(position)
	end
	local root = Instance.new("Part")
	root.Name, root.Size, root.Transparency = "VisualRoot", Vector3.new(0.05, 0.05, 0.05), 1
	root.Anchored, root.Massless, root.CastShadow = true, true, false
	root.CanCollide, root.CanQuery, root.CanTouch = false, false, false
	root.CFrame, root.Parent = CFrame.identity, model
	model.PrimaryPart = root
	table.insert(parts, { part = root, offset = CFrame.identity, name = "VisualRoot" })
	for name, offset in offsets do
		local attachment = Instance.new("Attachment")
		attachment.Name, attachment.CFrame, attachment.Parent = name, offset, root
	end
	return {
		model = model, parts = parts, attachments = offsets,
		hipOffset = definition.HipOffset and CFrame.new(vector(definition.HipOffset)) or CFrame.new(0.57, -0.63, -1.35),
		adsOffset = CFrame.new(0, 0, -(definition.ADSRearDistance or 0.76)) * offsets.ADSSight:Inverse(),
	}
end

function WeaponVisualAdapter.Load(weaponId, parent)
	local definition = Config.Weapons[weaponId]
	local folder = bastion:FindFirstChild(Config.TemplateFolder)
	local template = folder and folder:FindFirstChild(weaponId)
	if not definition or not template or not template:IsA("Model") then return nil end
	if #template:GetDescendants() > Config.MaxDescendantCount then return nil end
	local clone
	local ok, result = pcall(function()
		clone = template:Clone()
		assert(clone, "template is not archivable")
		clone.Name = weaponId .. "Visual"
		local visual = prepare(clone, definition)
		-- Parent only after stripping every nonvisual object.
		clone.Parent = parent
		return visual
	end)
	if not ok then
		if clone then clone:Destroy() end
		if not warned[weaponId] then
			warn("[Bastion] Visual " .. weaponId .. " unavailable; using procedural fallback: " .. tostring(result))
			warned[weaponId] = true
		end
		return nil
	end
	return result
end

return WeaponVisualAdapter
