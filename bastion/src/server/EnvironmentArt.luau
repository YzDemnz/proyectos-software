--!nonstrict
-- Static art dressing over the existing collision/navigation layout. No loops/connections at runtime.
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("Bastion"):WaitForChild("Shared"):WaitForChild("VisualConfig"))

local EnvironmentArt = {}
local function rgb(value) return Color3.fromRGB(value[1], value[2], value[3]) end
local Palette = {}
for key, value in pairs(Config.Palette) do Palette[key] = rgb(value) end
local function vector(value) return Vector3.new(value[1], value[2], value[3]) end

function EnvironmentArt.Apply(world, visualAssets)
	if world:FindFirstChild("EnvironmentArt") then return world.EnvironmentArt end
	local root = Instance.new("Folder")
	root.Name = "EnvironmentArt"
	root:SetAttribute("ArtVersion", Config.Version)
	root.Parent = world
	local groups = {}
	for _, name in ipairs({ "Structure", "FloorDetail", "Equipment", "SetDressing", "Lighting", "Atmosphere" }) do
		local folder = Instance.new("Folder")
		folder.Name = name
		folder.Parent = root
		groups[name] = folder
	end
	local count = { Parts = 0, Lights = 0, Shadows = 0, Emitters = 0, ParticleRate = 0, Imports = 0, StrippedScripts = 0, Skipped = 0 }
	local function roomFor(amount)
		if count.Parts + amount <= Config.Budget.Parts then return true end
		count.Skipped += 1
		return false
	end
	local function part(name, size, cf, color, material, parent, shape)
		assert(count.Parts < Config.Budget.Parts, "EnvironmentArt: static part budget exceeded")
		local p = Instance.new("Part")
		p.Name, p.Size, p.CFrame = name, size, cf
		p.Color, p.Material = Palette[color] or color or Palette.Steel, Enum.Material[material or "Metal"]
		p.Anchored, p.CanCollide, p.CanTouch, p.CanQuery = true, false, false, false
		p.CastShadow = size.Y > 0.1 and size.X > 0.1 and size.Z > 0.1
		p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
		if shape then p.Shape = shape end
		p.Parent = parent or groups.SetDressing
		count.Parts += 1
		return p
	end
	local function box(name, size, position, color, material, parent)
		return part(name, vector(size), CFrame.new(vector(position)), color, material, parent)
	end
	local function bar(name, a, b, width, color, parent)
		local mid, length = (a + b) / 2, (a - b).Magnitude
		return part(name, Vector3.new(width, width, length), CFrame.lookAt(mid, b), color, "Metal", parent)
	end
	local function cylinder(name, radius, length, cf, color, parent)
		return part(name, Vector3.new(length, radius * 2, radius * 2), cf * CFrame.Angles(0, 0, math.pi / 2), color,
			"Metal", parent, Enum.PartType.Cylinder)
	end
	local function plateText(parent, text, face, color, pixelDensity)
		local gui = Instance.new("SurfaceGui")
		gui.Name, gui.Face = "EnvironmentalLabel", face or Enum.NormalId.Front
		gui.SizingMode, gui.PixelsPerStud = Enum.SurfaceGuiSizingMode.PixelsPerStud, pixelDensity or 28
		gui.LightInfluence, gui.AlwaysOnTop = 0.65, false
		gui.MaxDistance = 100
		gui.Parent = parent
		local label = Instance.new("TextLabel")
		label.Size, label.BackgroundTransparency = UDim2.fromScale(1, 1), 1
		label.Font, label.TextScaled = Enum.Font.RobotoMono, true
		label.Text, label.TextColor3 = text, Palette[color or "Ivory"]
		label.Parent = gui
	end
	local function sign(text, cf, width, height, color, parent)
		local p = part("Wayfinding_" .. text:gsub("\n", "_"), Vector3.new(width, height, 0.08), cf,
			"Rubber", "Metal", parent)
		plateText(p, text, Enum.NormalId.Front, color)
		return p
	end
	local function light(parent, color, brightness, range, shadows, spot)
		if count.Lights >= Config.Budget.LocalLights then return end
		local l = Instance.new(spot and "SpotLight" or "PointLight")
		l.Name, l.Color, l.Brightness, l.Range = "BastionLocalLight", Palette[color], brightness, range
		l.Shadows = shadows and count.Shadows < Config.Budget.ShadowLights or false
		if l.Shadows then count.Shadows += 1 end
		if spot then l.Face, l.Angle = Enum.NormalId.Front, Config.Lighting.SpotAngle end
		l.Parent = parent
		count.Lights += 1
	end
	local function import(name, cf, bounds, parent)
		local template = visualAssets and visualAssets:FindFirstChild(Config.AssetIntegration[name] or name, true)
		if not template or not template:IsA("Model") then return false end
		local pieces = 0
		for _, child in ipairs(template:GetDescendants()) do
			if child:IsA("BasePart") then pieces += 1 end
		end
		if pieces == 0 or pieces > Config.Budget.ImportedPartsPerModel or not roomFor(pieces) then return false end
		local clone = template:Clone()
		for _, child in ipairs(clone:GetDescendants()) do
			if child:IsA("BaseScript") or child:IsA("ModuleScript") then
				child:Destroy()
				count.StrippedScripts += 1
			elseif child:IsA("BasePart") then
				child.Anchored, child.CanCollide, child.CanQuery, child.CanTouch = true, false, false, false
				if child:IsA("MeshPart") then child.RenderFidelity = Enum.RenderFidelity.Automatic end
			elseif child:IsA("Light") or child:IsA("ParticleEmitter") or child:IsA("Sound") or child:IsA("ProximityPrompt")
				or child:IsA("ClickDetector") or child:IsA("TouchTransmitter") or child:IsA("Humanoid")
				or child:IsA("JointInstance") or child:IsA("Constraint") then
				child:Destroy()
			end
		end
		local success = pcall(function()
			local _, extents = clone:GetBoundingBox()
			local smallest, biggest = math.min(extents.X, extents.Y, extents.Z), math.max(extents.X, extents.Y, extents.Z)
			assert(smallest >= Config.AssetIntegration.MinimumSourceExtent and biggest <= Config.AssetIntegration.MaximumSourceExtent)
			local scale = math.min(bounds.X / extents.X, bounds.Y / extents.Y, bounds.Z / extents.Z)
			clone:ScaleTo(clone:GetScale() * scale)
			-- Imported pivots are arbitrary: align the actual bounding box, not just the pivot.
			local bb, newExtents = clone:GetBoundingBox()
			local pivotOffset = bb:ToObjectSpace(clone:GetPivot())
			local centered = cf * CFrame.new(0, (newExtents.Y - bounds.Y) / 2, 0)
			clone:PivotTo(centered * pivotOffset)
		end)
		if not success then clone:Destroy(); return false end
		clone.Name = "CreatorStore_" .. name
		clone:SetAttribute("VisualOnly", true)
		clone.Parent = parent or groups.Equipment
		count.Parts += pieces
		count.Imports += 1
		return true
	end

	-- Refine the existing structural solids. Collision surfaces and all doorway dimensions remain identical.
	for _, slab in ipairs(world.Architecture:GetChildren()) do
		if not slab:IsA("BasePart") then continue end
		if slab.Name == "Bulkhead" then
			slab.Color, slab.Material = Palette.Concrete, Enum.Material.Concrete
			local alongX = slab.Size.X > slab.Size.Z
			local length = alongX and slab.Size.X or slab.Size.Z
			local thickness = alongX and slab.Size.Z or slab.Size.X
			local within = math.abs(slab.Position.X) < 109 and math.abs(slab.Position.Z) < 109
			if slab.Size.Y >= 12 and within and roomFor(24) then
				local base = slab.CFrame * (alongX and CFrame.identity or CFrame.Angles(0, math.pi / 2, 0))
				for _, side in ipairs({ -1, 1 }) do
					local z = side * (thickness / 2 + Config.Architecture.SkinDepth / 2)
					part("LowerWallPaint", Vector3.new(length, Config.Architecture.WallBandHeight, Config.Architecture.SkinDepth),
						base * CFrame.new(0, -slab.Size.Y / 2 + Config.Architecture.WallBandHeight / 2, z), "Paint", "Concrete", groups.Structure)
					part("WallCapRail", Vector3.new(length, 0.16, 0.1), base * CFrame.new(0, -3.9, z + side * 0.02),
						"SteelEdge", "Metal", groups.Structure)
					part("FloorSkirting", Vector3.new(length, 0.38, 0.14), base * CFrame.new(0, -slab.Size.Y / 2 + 0.19, z),
						"ConcreteDark", "Concrete", groups.Structure)
					local ribs = math.max(1, math.floor(length / Config.Architecture.PanelSpacing))
					for index = 1, ribs do
						local offset = -length / 2 + length * (index / (ribs + 1))
						part("ExpansionJoint", Vector3.new(0.075, slab.Size.Y - 0.3, 0.06), base * CFrame.new(offset, 0, z),
							"ConcreteDark", "Concrete", groups.Structure)
					end
				end
			elseif slab.Size.Y < 12 then slab.Color, slab.Material = Palette.Steel, Enum.Material.Metal end
		elseif slab.Name == "DoorJamb" then
			slab.Color = Palette.SteelEdge
			if roomFor(2) then
				for _, side in ipairs({ -1, 1 }) do
					part("ThresholdHazard", Vector3.new(slab.Size.X + 0.04, 0.22, slab.Size.Z + 0.04),
						slab.CFrame * CFrame.new(0, -3.4 + side * 0.38, 0), "Amber", "SmoothPlastic", groups.Structure)
				end
			end
		elseif slab.Name == "Foundation" then slab.Color = Palette.ConcreteDark
		elseif slab.Name == "CourtyardAsphalt" then slab.Color = Palette.Asphalt
		elseif slab.Name == "ReinforcedRoof" then slab.Color = Palette.ConcreteDark end
	end

	-- The visible ceiling grid provides enclosure without filling clear firing lanes.
	for _, x in ipairs({ -96, -58, -25, 25, 58, 96 }) do
		for _, z in ipairs({ -76, 76 }) do
			if roomFor(2) then
				box("RoofIBeam", { 0.5, 0.8, 54 }, { x, 15.35, z }, "Steel", "Metal", groups.Structure)
				box("RoofFlange", { 1.6, 0.13, 54 }, { x, 14.97, z }, "SteelEdge", "Metal", groups.Structure)
			end
		end
	end
	for _, x in ipairs({ -98, 98 }) do
		if roomFor(24) then
			cylinder("ServiceMain", 0.32, 194, CFrame.new(x, 13.25, 0) * CFrame.Angles(math.pi / 2, 0, 0), "Steel", groups.Structure)
			cylinder("ReturnMain", 0.17, 194, CFrame.new(x - math.sign(x) * 1.1, 12.8, 0) * CFrame.Angles(math.pi / 2, 0, 0), "Rust", groups.Structure)
			for _, z in ipairs({ -89, -59, -29, 1, 31, 61, 91 }) do
				cylinder("PipeCoupler", 0.41, 0.24, CFrame.new(x, 13.25, z) * CFrame.Angles(math.pi / 2, 0, 0), "SteelEdge", groups.Structure)
				box("PipeHanger", { 2.3, 0.18, 0.28 }, { x - math.sign(x) * 0.35, 12.78, z }, "SteelEdge", "Metal", groups.Structure)
				box("HangerDrop", { 0.12, 2.3, 0.12 }, { x - math.sign(x) * 0.8, 14.1, z }, "Steel", "Metal", groups.Structure)
			end
		end
	end
	for _, z in ipairs({ -97, 97 }) do
		if roomFor(18) then
			box("CableTray", { 190, 0.18, 1.25 }, { 0, 12.9, z }, "Steel", "DiamondPlate", groups.Structure)
			for _, dz in ipairs({ -0.42, 0, 0.42 }) do
				cylinder("PowerCable", 0.075, 190, CFrame.new(0, 13.07, z + dz) * CFrame.Angles(0, 0, math.pi / 2), "Rubber", groups.Structure)
			end
			for _, x in ipairs({ -87, -58, -29, 0, 29, 58, 87 }) do
				box("CableTraySupport", { 0.15, 0.28, 1.75 }, { x, 12.78, z }, "SteelEdge", "Metal", groups.Structure)
			end
		end
	end

	local function floorStripe(x, z, sx, sz, color)
		return box("WornFloorMark", { sx, Config.Architecture.FloorMarkDepth, sz },
			{ x, Config.Architecture.FloorMarkHeight, z }, color or "Ivory", "SmoothPlastic", groups.FloorDetail)
	end
	for _, z in ipairs({ -41, 41 }) do
		for _, x in ipairs({ -76, 0, 76 }) do
			if roomFor(5) then
				for stripe = -2, 2 do floorStripe(x + stripe * 2.1, z, 1.25, 3, "Amber") end
			end
		end
	end
	for _, x in ipairs({ -76, 76 }) do
		for _, z in ipairs({ -65, -40, -15, 15, 40, 65 }) do
			if roomFor(1) then floorStripe(x, z, 0.17, 6, "Ivory") end
		end
	end
	for _, p in ipairs({ { -31, 0 }, { 31, 0 }, { 0, -31 }, { 0, 31 } }) do
		if roomFor(6) then
			box("StormDrain", { 5, 0.025, 1.4 }, { p[1], 0.112, p[2] }, "Rubber", "Metal", groups.FloorDetail)
			for n = -2, 2 do box("DrainGrille", { 0.11, 0.04, 1.25 }, { p[1] + n * 0.87, 0.13, p[2] }, "SteelEdge", "Metal", groups.FloorDetail) end
		end
	end

	local function crateVisual(solid, index)
		if not roomFor(20) then return end
		-- Retain the collider: cosmetic trim never changes hit detection or cover height.
		solid.Color, solid.Material = Palette.Olive, Enum.Material.Metal
		local size, cf = solid.Size, solid.CFrame
		local imported = import("MilitaryCrate", cf, size, groups.Equipment)
		if imported then
			-- The old solid is still a muted inner shell; imported mesh gaps never reveal empty cover.
			solid.Color = Palette.Rubber
			return
		end
		for _, x in ipairs({ -size.X * 0.35, size.X * 0.35 }) do
			part("CrateBinding", Vector3.new(0.2, size.Y + 0.055, size.Z + 0.055), cf * CFrame.new(x, 0, 0), "SteelEdge", "Metal", groups.Equipment)
		end
		for _, z in ipairs({ -1, 1 }) do
			for _, y in ipairs({ -size.Y * 0.39, size.Y * 0.39 }) do
				part("CrateRib", Vector3.new(size.X + 0.08, 0.16, 0.12), cf * CFrame.new(0, y, z * (size.Z / 2 + 0.04)), "Steel", "Metal", groups.Equipment)
			end
			part("RecessedHandle", Vector3.new(math.min(1.3, size.X / 4), 0.23, 0.09), cf * CFrame.new(0, 0.55, z * (size.Z / 2 + 0.085)), "Rubber", "Metal", groups.Equipment)
		end
		sign(string.format("B / %03d\nFIELD SUPPLY", index), cf * CFrame.new(size.X * 0.22, 0, -size.Z / 2 - 0.12),
			math.min(2.3, size.X * 0.35), 1.35, "Ivory", groups.Equipment)
	end
	local crateIndex = 0
	for _, solid in ipairs(world.Architecture:GetChildren()) do
		if solid.Name == "SupplyCrate" then crateIndex += 1; crateVisual(solid, crateIndex) end
	end

	-- Give the central cover a readable industrial silhouette without altering its collider.
	local generator = world.Architecture:FindFirstChild("CourtyardGenerator")
	if generator and roomFor(60) then
		generator.Color, generator.Material = Palette.Paint, Enum.Material.Metal
		if not import("Generator", generator.CFrame, generator.Size, groups.Equipment) then
			for _, z in ipairs({ -3.6, 3.6 }) do
				box("GeneratorSkid", { 10.2, 0.5, 0.45 }, { 0, 0.25, z }, "Rubber", "Metal", groups.Equipment)
			end
			for _, x in ipairs({ -1, 1 }) do
				box("GeneratorLouverWell", { 0.1, 4, 6 }, { x * 5.07, 4, 0 }, "Rubber", "Metal", groups.Equipment)
				for y = 0, 7 do
					part("GeneratorLouver", Vector3.new(0.22, 0.18, 5.8), CFrame.new(x * 5.13, 2.4 + y * 0.43, 0)
						* CFrame.Angles(0, 0, x * 0.24), "SteelEdge", "Metal", groups.Equipment)
				end
			end
			box("GeneratorAccessPanel", { 6.7, 4.8, 0.12 }, { 0, 3.8, -4.57 }, "Steel", "Metal", groups.Equipment)
			box("GeneratorInstrument", { 2.2, 1.2, 0.13 }, { 1.6, 4.7, -4.68 }, "Rubber", "Metal", groups.Equipment)
			for _, x in ipairs({ 0.9, 1.7, 2.4 }) do
				cylinder("Dial", 0.22, 0.1, CFrame.new(x, 4.7, -4.8) * CFrame.Angles(math.pi / 2, 0, 0), "Ivory", groups.Equipment)
			end
			cylinder("Exhaust", 0.28, 2.8, CFrame.new(3.7, 8.25, 2.8), "Steel", groups.Equipment)
			cylinder("ExhaustCap", 0.45, 0.16, CFrame.new(3.7, 9.7, 2.8), "Rubber", groups.Equipment)
			sign("AUXILIARY POWER\nDIESEL / 480 V", CFrame.new(-0.8, 2.4, -4.72), 3.3, 1.1, "Amber", groups.Equipment)
		end
	end

	local function equipmentGroup(name, cf)
		local model = Instance.new("Model")
		model.Name, model.Parent = name, groups.Equipment
		local function add(label, size, position, color, material, shape)
			return part(label, vector(size), cf * CFrame.new(vector(position)), color, material, model, shape)
		end
		return model, add
	end
	local function bench(cf, laboratory)
		if not roomFor(35) then return end
		local model, add = equipmentGroup(laboratory and "ResearchBench" or "MaintenanceBench", cf)
		add("Worktop", { 12, 0.3, 3.2 }, { 0, 3.1, 0 }, laboratory and "Ivory" or "SteelEdge", "Metal")
		for _, x in ipairs({ -4.8, 4.8 }) do
			add("StorageCabinet", { 2, 2.9, 2.75 }, { x, 1.5, 0 }, "Paint", "Metal")
			for _, y in ipairs({ 0.9, 1.8, 2.7 }) do
				add("DrawerSeam", { 1.8, 0.035, 0.05 }, { x, y, -1.4 }, "Rubber", "Metal")
				add("DrawerHandle", { 0.65, 0.1, 0.14 }, { x, y - 0.22, -1.47 }, "SteelEdge", "Metal")
			end
		end
		add("MonitorPedestal", { 0.2, 0.7, 0.3 }, { -2.8, 3.55, 0.5 }, "Rubber", "Metal")
		local screen = add("MonitorHousing", { 2.5, 1.65, 0.22 }, { -2.8, 4.45, 0.5 }, "Rubber", "Metal")
		plateText(screen, laboratory and "SAMPLE 07\nSIGNAL LOST" or "BACKUP GRID\nSTANDBY", Enum.NormalId.Front, "Monitor", 28)
		add("Keyboard", { 1.85, 0.1, 0.6 }, { -2.8, 3.31, -0.8 }, "Rubber", "Metal")
		if laboratory then
			if not import("LabProps", cf * CFrame.new(2.5, 4.4, 0), Vector3.new(3.5, 2.4, 2.4), model) then
				add("Centrifuge", { 2.1, 1, 1.8 }, { 1.5, 3.75, 0 }, "Plaster", "Metal")
				add("CentrifugeLid", { 1.65, 0.08, 1.35 }, { 1.5, 4.3, 0 }, "SteelEdge", "Metal")
				for _, x in ipairs({ 3.4, 4.1, 4.8 }) do
					local bottle = cylinder("SampleVial", 0.17, 0.75, cf * CFrame.new(x, 3.7, -0.5), "Glass", model)
					bottle.Material, bottle.Transparency = Enum.Material.Glass, 0.2
					cylinder("SampleCap", 0.18, 0.1, cf * CFrame.new(x, 4.12, -0.5), "Amber", model)
				end
			end
		else
			add("Toolbox", { 2.5, 0.9, 1.4 }, { 2.3, 3.75, 0 }, "Rust", "Metal")
			add("ToolboxLid", { 2.6, 0.11, 1.5 }, { 2.3, 4.23, 0 }, "SteelEdge", "Metal")
			add("OpenManual", { 1.6, 0.02, 1.1 }, { 0, 3.27, -0.5 }, "Ivory", "SmoothPlastic")
		end
	end
	bench(CFrame.new(22, 0, -99), true)
	bench(CFrame.new(88, 0, -99), true)
	bench(CFrame.new(99, 0, -13) * CFrame.Angles(0, -math.pi / 2, 0), false)
	bench(CFrame.new(21, 0, 99) * CFrame.Angles(0, math.pi, 0), false)

	local function rack(cf)
		if not roomFor(27) then return end
		local _, add = equipmentGroup("StoreRoomRacking", cf)
		for _, x in ipairs({ -4.8, 4.8 }) do
			for _, z in ipairs({ -1.25, 1.25 }) do add("RackUpright", { 0.18, 9, 0.18 }, { x, 4.5, z }, "SteelEdge", "Metal") end
		end
		for _, y in ipairs({ 0.6, 3.4, 6.2, 8.9 }) do
			add("Shelf", { 10, 0.12, 2.9 }, { 0, y, 0 }, "Steel", "DiamondPlate")
			add("ShelfFace", { 10, 0.25, 0.08 }, { 0, y - 0.03, -1.48 }, "Rust", "Metal")
		end
		for _, p in ipairs({ { -3, 1.7 }, { 2.1, 1.7 }, { -2.6, 4.5 }, { 2.5, 4.5 }, { -2.8, 7.3 }, { 1.4, 7.3 } }) do
			add("StorageCase", { 3.2, 2.1, 2.3 }, { p[1], p[2], 0 }, "Olive", "Metal")
			add("CaseStrap", { 0.17, 2.12, 2.34 }, { p[1] - 0.85, p[2], 0 }, "SteelEdge", "Metal")
		end
	end
	rack(CFrame.new(-58, 0, -99))
	rack(CFrame.new(-99, 0, -63) * CFrame.Angles(0, math.pi / 2, 0))
	rack(CFrame.new(99, 0, 64) * CFrame.Angles(0, -math.pi / 2, 0))

	-- Wall-bound technical installations preserve both circulating paths and all ten enemy breach volumes.
	for _, p in ipairs({ { -100.8, -18, math.pi / 2 }, { 100.8, 39, -math.pi / 2 }, { 28, -101, 0 } }) do
		if roomFor(25) then
			local cf = CFrame.new(p[1], 0, p[2]) * CFrame.Angles(0, p[3], 0)
			local _, add = equipmentGroup("PowerDistribution", cf)
			add("PanelCabinet", { 5, 7, 0.8 }, { 0, 4, 0 }, "Paint", "Metal")
			add("PanelSeam", { 0.05, 6.5, 0.06 }, { 0.8, 4, -0.44 }, "Rubber", "Metal")
			add("LockHandle", { 0.12, 0.9, 0.13 }, { 0.45, 4, -0.5 }, "SteelEdge", "Metal")
			for _, x in ipairs({ -1.7, -0.8 }) do
				cylinder("CableConduit", 0.08, 5.3, cf * CFrame.new(x, 10.1, 0), "SteelEdge", groups.Equipment)
			end
			sign("DANGER\nHIGH VOLTAGE", cf * CFrame.new(-0.75, 5.6, -0.52), 2, 1.25, "Amber", groups.Equipment)
			for _, y in ipairs({ 1.5, 1.8, 2.1, 2.4 }) do add("PanelVent", { 3.8, 0.08, 0.08 }, { 0, y, -0.46 }, "Rubber", "Metal") end
		end
	end

	-- Curved drums and hose routing add silhouettes that the original rectangular blockout lacked.
	for _, p in ipairs({ { -99, -39 }, { -96, -39 }, { 99, 81 }, { 96, 81 } }) do
		if roomFor(6) then
			local cf = CFrame.new(p[1], 1.6, p[2])
			if not import("OilDrum", cf, Vector3.new(2.3, 3.2, 2.3), groups.Equipment) then
				cylinder("IndustrialDrum", 1.1, 3.2, cf, "Paint", groups.Equipment)
				for _, y in ipairs({ -1.43, -0.6, 0.6, 1.43 }) do cylinder("DrumBand", 1.14, 0.09, cf * CFrame.new(0, y, 0), "SteelEdge", groups.Equipment) end
				cylinder("DrumBung", 0.12, 0.09, cf * CFrame.new(0.5, 1.65, 0.2), "Rubber", groups.Equipment)
			end
		end
	end

	-- An abandoned compact service tug occupies existing courtyard cover, not a new road obstacle.
	local vehicleCover
	for _, solid in ipairs(world.Architecture:GetChildren()) do
		if solid.Name == "SupplyCrate" and (solid.Position - Vector3.new(-19, 2, -18)).Magnitude < 0.1 then vehicleCover = solid end
	end
	if vehicleCover and roomFor(48) then
		local cf, size = vehicleCover.CFrame, vehicleCover.Size
		if import("AbandonedVehicle", cf, size, groups.Equipment) then
			vehicleCover.Color = Palette.Rubber
		else
			local _, add = equipmentGroup("AbandonedServiceTug", cf)
			-- The old cover stays as the underbody. All authored vehicle detail stays near that footprint.
			vehicleCover.Color, vehicleCover.Material = Palette.Steel, Enum.Material.Metal
			add("CargoDeck", { 6.7, 0.18, 4.05 }, { 2.3, 2.12, 0 }, "SteelEdge", "DiamondPlate")
			add("MotorHood", { 4.4, 0.25, 3.9 }, { -4.6, 2.2, 0 }, "Olive", "Metal")
			for _, z in ipairs({ -2.03, 2.03 }) do
				add("SideSill", { 13.9, 0.55, 0.08 }, { 0, -0.45, z }, "Rubber", "Metal")
				add("CargoSide", { 6.5, 0.8, 0.11 }, { 2.4, 2.5, z }, "Paint", "Metal")
				for _, x in ipairs({ -4.8, 4.5 }) do
					cylinder("Wheel", 1.12, 0.24, cf * CFrame.new(x, -0.8, z) * CFrame.Angles(math.pi / 2, 0, 0), "Rubber", groups.Equipment)
					cylinder("WheelHub", 0.52, 0.28, cf * CFrame.new(x, -0.8, z * 1.025) * CFrame.Angles(math.pi / 2, 0, 0), "SteelEdge", groups.Equipment)
				end
			end
			add("FrontBumper", { 0.17, 0.4, 4.12 }, { -7.09, 0.1, 0 }, "Rust", "Metal")
			for _, z in ipairs({ -1.4, 1.4 }) do add("BrokenHeadlamp", { 0.12, 0.55, 0.8 }, { -7.19, 0.85, z }, "Ivory", "Glass") end
			add("SeatCushion", { 1.9, 0.24, 2.8 }, { -1.5, 2.22, 0 }, "Rubber", "SmoothPlastic")
			add("SeatBack", { 0.22, 1.6, 2.8 }, { -0.5, 3, 0 }, "Rubber", "SmoothPlastic")
			bar("BrokenRollbar", cf:PointToWorldSpace(Vector3.new(-0.1, 2, -1.7)), cf:PointToWorldSpace(Vector3.new(0.8, 4.1, -1.3)), 0.17, "SteelEdge", groups.Equipment)
			sign("B-17\nSITE OPERATIONS", cf * CFrame.new(-4.5, 0.4, -2.12), 2.2, 1.2, "Ivory", groups.Equipment)
		end
	end

	-- Hand-authored signage and repair details; no external images or unlicensed decal dependencies.
	for _, entry in ipairs({
		{ "RESEARCH ANNEX\nBIOLOGICAL MATERIALS", { 67, 9, -101.7 }, 0, 11, "Ice" },
		{ "LOADING / 02\nAUTHORIZED PERSONNEL", { -64, 10, -101.7 }, 0, 11, "Amber" },
		{ "UTILITY BAY\nKEEP ACCESS CLEAR", { 101.7, 9, 13 }, -math.pi / 2, 10, "Amber" },
		{ "RECOVERY WARD\nNO ACTIVE SIGNAL", { 65, 9, 101.7 }, math.pi, 11, "Ice" },
		{ "EMERGENCY LOOP  >", { -49.1, 7.4, -11 }, math.pi / 2, 13, "Ivory" },
		{ "<  COURTYARD", { 49.1, 7.4, 11 }, -math.pi / 2, 12, "Ivory" },
	}) do
		if roomFor(1) then sign(entry[1], CFrame.new(vector(entry[2])) * CFrame.Angles(0, entry[3], 0), entry[4], 2.1, entry[5]) end
	end
	local gate = world.Architecture:FindFirstChild("SealedGate")
	if gate and roomFor(15) then
		gate.Color = Palette.Paint
		for _, x in ipairs({ -9.4, -6.2, -3.1, 0, 3.1, 6.2, 9.4 }) do
			box("GateRib", { 0.18, 10.5, 0.15 }, { x, 5.5, -102.22 }, "SteelEdge", "Metal", groups.Structure)
		end
		for _, y in ipairs({ 1.2, 8.8 }) do box("GateCrossrail", { 21.7, 0.35, 0.24 }, { 0, y, -102.16 }, "Steel", "Metal", groups.Structure) end
		sign("04\nCONTAINMENT / SEALED", CFrame.new(0, 7, -101.94) * CFrame.Angles(0, math.pi, 0), 8.3, 1.8, "Amber", groups.Structure)
	end

	-- Sparse debris is deliberately confined to wall edges, never centered on route/spawn markers.
	local random = Random.new(4107)
	for _, corner in ipairs({ { -96, -96 }, { 97, -65 }, { 98, 94 }, { 34, -98 }, { -98, 39 }, { 59, 98 } }) do
		if roomFor(9) then
			for n = 1, 7 do
				local x, z = corner[1] + random:NextNumber(-2.5, 2.5), corner[2] + random:NextNumber(-2, 2)
				part("ConcreteSpall", Vector3.new(random:NextNumber(0.2, 0.9), random:NextNumber(0.06, 0.18), random:NextNumber(0.25, 0.8)),
					CFrame.new(x, 0.14, z) * CFrame.Angles(0, random:NextNumber(-math.pi, math.pi), 0),
					n % 3 == 0 and "Rust" or "Concrete", n % 3 == 0 and "CorrodedMetal" or "Concrete", groups.SetDressing)
			end
			part("DiscardedReport", Vector3.new(0.9, 0.012, 1.25), CFrame.new(corner[1], 0.11, corner[2]) * CFrame.Angles(0, 0.4, 0),
				"Ivory", "SmoothPlastic", groups.SetDressing)
		end
	end

	-- Refine existing fixtures instead of duplicating their lights. Emergency accents are intentionally dim.
	for _, fixture in ipairs(world.Fixtures:GetChildren()) do
		if fixture.Name == "CagedLight" and fixture:IsA("BasePart") then
			local existing = fixture:FindFirstChildOfClass("PointLight")
			if existing then
				existing.Brightness = Config.Lighting.ExistingLightBrightness
				existing.Shadows = false
				count.Lights += 1
			end
			if roomFor(7) then
				part("LuminaireHousing", fixture.Size + Vector3.new(0.35, 0.28, 0.35), fixture.CFrame * CFrame.new(0, 0.22, 0), "Rubber", "Metal", groups.Lighting)
				for _, x in ipairs({ -1.2, 0, 1.2 }) do
					part("LightCage", Vector3.new(0.055, 0.45, 1.1), fixture.CFrame * CFrame.new(x, -0.16, 0), "Steel", "Metal", groups.Lighting)
				end
			end
		end
	end
	for _, entry in ipairs({ { -26, -49.3, 0 }, { 26, 49.3, math.pi }, { -99, -48, math.pi / 2 }, { 99, 48, -math.pi / 2 } }) do
		if roomFor(4) then
			local cf = CFrame.new(entry[1], 11.8, entry[2]) * CFrame.Angles(0, entry[3], 0)
			part("EmergencyHousing", Vector3.new(1.1, 1.3, 0.5), cf, "Rubber", "Metal", groups.Lighting)
			local lens = part("EmergencyLens", Vector3.new(0.65, 0.8, 0.16), cf * CFrame.new(0, 0, -0.32), "Red", "Neon", groups.Lighting)
			light(lens, "Red", Config.Lighting.EmergencyBrightness, Config.Lighting.EmergencyRange, false)
		end
	end
	for _, entry in ipairs({ { -46.5, 13.5, -35, -math.pi / 2 }, { 46.5, 13.5, 35, math.pi / 2 } }) do
		if roomFor(3) then
			local cf = CFrame.new(entry[1], entry[2], entry[3]) * CFrame.Angles(0, entry[4], 0) * CFrame.Angles(-0.35, 0, 0)
			part("FloodlightShell", Vector3.new(2.4, 1.25, 0.8), cf, "Steel", "Metal", groups.Lighting)
			local lens = part("FloodlightLens", Vector3.new(2.05, 0.9, 0.08), cf * CFrame.new(0, 0, -0.45), "Ice", "Neon", groups.Lighting)
			light(lens, "Ice", 2, Config.Lighting.SpotRange, true, true)
		end
	end
	for _, p in ipairs({ { 82, 6.1, -97.7 }, { 94, 6.1, -13 }, { 21, 6.1, 97.7 } }) do
		if roomFor(1) then
			local tube = box("TaskLuminaire", { 4.5, 0.1, 0.15 }, p, "Ice", "Neon", groups.Lighting)
			light(tube, "Ice", Config.Lighting.TaskBrightness, Config.Lighting.TaskRange, false)
		end
	end

	local l = Config.Lighting
	Lighting.ClockTime, Lighting.Brightness, Lighting.ExposureCompensation = l.ClockTime, l.Brightness, l.ExposureCompensation
	Lighting.Ambient, Lighting.OutdoorAmbient = rgb(l.Ambient), rgb(l.OutdoorAmbient)
	Lighting.EnvironmentDiffuseScale, Lighting.EnvironmentSpecularScale = l.EnvironmentDiffuseScale, l.EnvironmentSpecularScale
	Lighting.GlobalShadows, Lighting.ShadowSoftness = true, l.ShadowSoftness
	Lighting.FogStart, Lighting.FogEnd, Lighting.FogColor = l.FogStart, l.FogEnd, rgb(l.FogColor)
	local function effect(class, name)
		local old = Lighting:FindFirstChild(name)
		if old and not old:IsA(class) then old:Destroy(); old = nil end
		local item = old or Instance.new(class)
		item.Name, item.Parent = name, Lighting
		return item
	end
	local atmosphere = effect("Atmosphere", "BastionAtmosphere")
	atmosphere.Density, atmosphere.Offset = l.AtmosphereDensity, l.AtmosphereOffset
	atmosphere.Color, atmosphere.Decay = rgb(l.AtmosphereColor), rgb(l.AtmosphereDecay)
	atmosphere.Glare, atmosphere.Haze = l.AtmosphereGlare, l.AtmosphereHaze
	local grade = effect("ColorCorrectionEffect", "BastionGrade")
	grade.Brightness, grade.Contrast, grade.Saturation, grade.TintColor = l.GradeBrightness, l.GradeContrast, l.GradeSaturation, rgb(l.GradeTint)
	local bloom = effect("BloomEffect", "BastionBloom")
	bloom.Intensity, bloom.Size, bloom.Threshold = l.BloomIntensity, l.BloomSize, l.BloomThreshold

	local function particles(position, steam)
		local p = Config.Particles
		local rate = steam and p.SteamRate or p.DustRate
		if count.Emitters >= Config.Budget.Emitters or count.ParticleRate + rate > Config.Budget.ParticlesPerSecond or not roomFor(1) then return end
		local anchor = box("AmbientEmitter", { 0.1, 0.1, 0.1 }, position, "Rubber", "SmoothPlastic", groups.Atmosphere)
		anchor.Transparency, anchor.CastShadow = 1, false
		local emitter = Instance.new("ParticleEmitter")
		emitter.Name, emitter.Texture = steam and "EscapingSteam" or "SuspendedDust", p.Texture
		emitter.Rate, emitter.Lifetime = rate, NumberRange.new(p.Lifetime[1], p.Lifetime[2])
		local speed = steam and p.SteamSpeed or p.DustSpeed
		emitter.Speed, emitter.SpreadAngle = NumberRange.new(speed[1], speed[2]), Vector2.new(28, 28)
		emitter.Color, emitter.LightInfluence, emitter.LightEmission = ColorSequence.new(Palette.Dust), 0.7, 0
		emitter.Size = NumberSequence.new(steam and p.SteamSize or p.DustSize)
		local transparency = steam and p.SteamTransparency or p.DustTransparency
		emitter.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.25, transparency), NumberSequenceKeypoint.new(1, 1) })
		emitter.Rotation, emitter.RotSpeed = NumberRange.new(0, 360), NumberRange.new(-8, 8)
		emitter.Parent = anchor
		count.Emitters += 1
		count.ParticleRate += rate
	end
	particles({ -94, 11, -62 }, true)
	particles({ 3.7, 9.9, 2.8 }, true)
	particles({ 80, 8, -81 }, false)
	particles({ -61, 7, -83 }, false)
	particles({ 21, 8, 80 }, false)

	for name, amount in pairs(count) do root:SetAttribute(name, amount) end
	root:SetAttribute("CollisionPolicy", "Original world colliders retained; all dressing non-colliding and non-queryable")
	root:SetAttribute("RuntimeConnections", 0)
	root:SetAttribute("RuntimeLoops", 0)
	return root
end

return EnvironmentArt
