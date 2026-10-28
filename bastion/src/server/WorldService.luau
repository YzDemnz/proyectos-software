--!nonstrict
-- Original, asset-free arena. All geometry belongs to one replaceable model.
local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local WorldService = {}
WorldService.__index = WorldService

local Palette = {
	Concrete = Color3.fromRGB(64, 71, 70), Dark = Color3.fromRGB(30, 38, 40),
	Steel = Color3.fromRGB(46, 57, 57), Rust = Color3.fromRGB(107, 67, 47),
	Amber = Color3.fromRGB(255, 186, 84), Ice = Color3.fromRGB(109, 203, 220),
	White = Color3.fromRGB(225, 232, 220), Red = Color3.fromRGB(172, 66, 48),
}

function WorldService.new(ctx)
	return setmetatable({ ctx = ctx }, WorldService)
end

function WorldService:Build()
	if self.result then return self.result end
	local cfg = self.ctx.Config.World
	assert(not Workspace:FindFirstChild(cfg.Name), "World already exists: " .. cfg.Name)
	local model = Instance.new("Model")
	model.Name = cfg.Name
	model.Parent = Workspace
	local geometry = Instance.new("Folder")
	geometry.Name = "Architecture"
	geometry.Parent = model
	local decoration = Instance.new("Folder")
	decoration.Name = "Fixtures"
	decoration.Parent = model
	local spawnFolder = Instance.new("Folder")
	spawnFolder.Name = "ZombieSpawns"
	spawnFolder.Parent = model

	local function part(name, size, position, color, material, parent)
		local item = Instance.new("Part")
		item.Name = name
		item.Size = size
		item.Position = position
		item.Anchored = true
		item.Color = color or Palette.Concrete
		item.Material = material or Enum.Material.Concrete
		item.TopSurface = Enum.SurfaceType.Smooth
		item.BottomSurface = Enum.SurfaceType.Smooth
		item.Parent = parent or geometry
		return item
	end
	local function sign(text, position, lookDirection, width, color)
		local backing = part("Sign_" .. text, Vector3.new(width or 14, 3, 0.18), position,
			Palette.Dark, Enum.Material.Metal, decoration)
		backing.CFrame = CFrame.lookAt(position, position + lookDirection)
		backing.CanCollide = false
		local surface = Instance.new("SurfaceGui")
		surface.Name = "Label"
		surface.Face = Enum.NormalId.Front
		surface.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		surface.PixelsPerStud = 40
		surface.LightInfluence = 0
		surface.Parent = backing
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Text = text
		label.TextScaled = true
		label.Font = Enum.Font.GothamBold
		label.TextColor3 = color or Palette.White
		label.Parent = surface
	end
	local function lamp(position, color, range)
		local mount = part("CagedLight", Vector3.new(3, 0.5, 1), position, color,
			Enum.Material.Neon, decoration)
		mount.CanCollide = false
		local light = Instance.new("PointLight")
		light.Color = color
		light.Range = range or 32
		light.Brightness = 1.5
		light.Shadows = false
		light.Parent = mount
	end
	local h, thick, doorWidth = cfg.WallHeight, cfg.WallThickness, cfg.DoorWidth
	-- Wall axis is X or Z; door coordinates follow that axis. Headers keep interiors enclosed.
	local function wall(axis, fixed, from, to, doors)
		local cursor = from
		local function segment(a, b, y, height, material)
			if b <= a then return end
			local size = axis == "X" and Vector3.new(b - a, height, thick)
				or Vector3.new(thick, height, b - a)
			local position = axis == "X" and Vector3.new((a + b) / 2, y, fixed)
				or Vector3.new(fixed, y, (a + b) / 2)
			part("Bulkhead", size, position, Palette.Concrete, material)
		end
		for _, center in ipairs(doors or {}) do
			segment(cursor, center - doorWidth / 2, h / 2, h)
			segment(center - doorWidth / 2, center + doorWidth / 2, h - 2, 4, Enum.Material.Metal)
			for _, edge in ipairs({ center - doorWidth / 2, center + doorWidth / 2 }) do
				local postPos = axis == "X" and Vector3.new(edge, 6, fixed)
					or Vector3.new(fixed, 6, edge)
				part("DoorJamb", Vector3.new(thick + 0.3, 12, thick + 0.3), postPos,
					Palette.Steel, Enum.Material.Metal)
			end
			cursor = center + doorWidth / 2
		end
		segment(cursor, to, h / 2, h)
	end

	-- Terrain is restricted to this world's footprint and lies below the navigation floor.
	Workspace.Terrain:FillBlock(CFrame.new(0, -6, 0),
		Vector3.new(cfg.HalfSize * 2, 6, cfg.HalfSize * 2), Enum.Material.Slate)
	part("Foundation", Vector3.new(cfg.HalfSize * 2, cfg.FloorThickness, cfg.HalfSize * 2),
		Vector3.new(0, -cfg.FloorThickness / 2, 0))
	part("CourtyardAsphalt", Vector3.new(94, 0.08, 94), Vector3.new(0, 0.04, 0),
		Color3.fromRGB(43, 47, 46), Enum.Material.Asphalt)
	for _, edge in ipairs({ -cfg.HalfSize, cfg.HalfSize }) do
		wall("X", edge, -cfg.HalfSize, cfg.HalfSize)
		wall("Z", edge, -cfg.HalfSize, cfg.HalfSize)
	end
	wall("X", -104, -104, 104)
	wall("X", 104, -104, 104)
	wall("Z", -104, -104, 104)
	wall("Z", 104, -104, 104)
	wall("X", -48, -104, 104, { -76, 0, 76 })
	wall("X", 48, -104, 104, { -76, 0, 76 })
	wall("Z", -48, -48, 48, { -27, 27 })
	wall("Z", 48, -48, 48, { -27, 27 })
	for _, x in ipairs({ -42, 42 }) do
		wall("Z", x, -104, -48, { -77 })
		wall("Z", x, 48, 104, { 77 })
	end
	wall("X", 0, -104, -48, { -77 })
	wall("X", 0, 48, 104, { 77 })
	for _, roof in ipairs({
		{ Vector3.new(210, 2, 58), Vector3.new(0, h + 1, -76) },
		{ Vector3.new(210, 2, 58), Vector3.new(0, h + 1, 76) },
		{ Vector3.new(58, 2, 96), Vector3.new(-76, h + 1, 0) },
		{ Vector3.new(58, 2, 96), Vector3.new(76, h + 1, 0) },
	}) do
		part("ReinforcedRoof", roof[1], roof[2], Palette.Dark, Enum.Material.Metal)
	end
	-- Ceiling beams, ground routes, and lights repeat predictably without client scripts.
	for _, x in ipairs({ -77, 0, 77 }) do
		for _, z in ipairs({ -77, 77 }) do
			lamp(Vector3.new(x, h - 2, z), x == -77 and z == 77 and Palette.Ice or Palette.Amber, 38)
			part("CeilingBrace", Vector3.new(2, 1.5, 54), Vector3.new(x, h - 0.5, z),
				Palette.Steel, Enum.Material.Metal)
		end
	end
	for _, x in ipairs({ -77, 77 }) do
		for _, z in ipairs({ -25, 25 }) do lamp(Vector3.new(x, h - 2, z), Palette.Amber, 32) end
	end
	for _, x in ipairs({ -38, 38 }) do
		part("PaintedRoute", Vector3.new(0.3, 0.03, 78), Vector3.new(x, 0.1, 0),
			Palette.Amber, Enum.Material.SmoothPlastic, decoration)
	end
	for _, z in ipairs({ -38, 38 }) do
		part("PaintedRoute", Vector3.new(78, 0.03, 0.3), Vector3.new(0, 0.1, z),
			Palette.Amber, Enum.Material.SmoothPlastic, decoration)
	end
	-- Low courtyard cover keeps the two circulation loops and each doorway clear.
	for _, cover in ipairs({
		{ -19, -18, 14, 4, 4 }, { 18, 20, 14, 4, 4 },
		{ -17, 17, 6, 5, 8 }, { 20, -19, 8, 5, 6 },
		{ -94, -86, 8, 5, 10 }, { 94, -87, 8, 5, 10 },
		{ -94, 30, 7, 4, 9 }, { 93, 27, 7, 4, 9 }, { 94, 89, 8, 5, 8 },
	}) do
		part("SupplyCrate", Vector3.new(cover[3], cover[4], cover[5]),
			Vector3.new(cover[1], cover[4] / 2, cover[2]), Palette.Steel, Enum.Material.DiamondPlate)
	end
	part("CourtyardGenerator", Vector3.new(10, 7, 9), Vector3.new(0, 3.5, 0),
		Palette.Rust, Enum.Material.CorrodedMetal)
	for _, x in ipairs({ -5.2, 5.2 }) do
		part("GeneratorVent", Vector3.new(0.3, 4, 6), Vector3.new(x, 4, 0),
			Palette.Dark, Enum.Material.DiamondPlate, decoration)
	end
	part("AntennaMast", Vector3.new(0.65, 27, 0.65), Vector3.new(0, 13.5, 0),
		Palette.Steel, Enum.Material.Metal, decoration)
	lamp(Vector3.new(0, 26, 0), Palette.Red, 20)
	-- A permanently blocked sector is visible inside the north control room.
	part("SealedGate", Vector3.new(22, 11, 1), Vector3.new(0, 5.5, -102.8),
		Palette.Steel, Enum.Material.DiamondPlate)
	for _, x in ipairs({ -8, -4, 0, 4, 8 }) do
		local stripe = part("QuarantineStripe", Vector3.new(1, 9, 0.2), Vector3.new(x, 5, -102),
			Palette.Amber, Enum.Material.SmoothPlastic, decoration)
		stripe.CFrame *= CFrame.Angles(0, 0, math.rad(-22))
		stripe.CanCollide = false
	end
	sign("SECTOR 04 / SELLADO", Vector3.new(0, 12, -101.7), Vector3.new(0, 0, 1), 23, Palette.Amber)
	sign("01 / CONTROL", Vector3.new(0, 13, -46.8), Vector3.new(0, 0, 1), 24)
	sign("02 / SUMINISTROS", Vector3.new(-46.8, 13, 0), Vector3.new(1, 0, 0), 24)
	sign("03 / MANTENIMIENTO", Vector3.new(46.8, 13, 0), Vector3.new(-1, 0, 0), 28)
	sign("BASTION / TURNO NOCTURNO", Vector3.new(0, 13, 46.8), Vector3.new(0, 0, -1), 30)

	local a = cfg.ArsenalPosition
	local arsenal = part("Arsenal", Vector3.new(12, 7, 3), Vector3.new(a[1], a[2], a[3]),
		Palette.Dark, Enum.Material.Metal, decoration)
	arsenal:SetAttribute("ArsenalTerminal", true)
	local face = part("ArsenalDisplay", Vector3.new(8, 3.5, 0.12),
		arsenal.Position + Vector3.new(0, 0.5, 1.56), Palette.Ice, Enum.Material.Neon, decoration)
	face.CanCollide = false
	sign("ARSENAL", arsenal.Position + Vector3.new(0, 5, 1.7), Vector3.new(0, 0, 1), 14, Palette.Ice)
	sign("ARMAS / MUNICION / MEJORAS", arsenal.Position + Vector3.new(0, 0.5, 1.7),
		Vector3.new(0, 0, 1), 10, Palette.Ice)
	sign("ARSENAL  <", Vector3.new(-60, 9, 49.2), Vector3.new(0, 0, 1), 17, Palette.Ice)
	lamp(arsenal.Position + Vector3.new(0, 9, 0), Palette.Ice, 28)
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "PlayerInsertion"
	local s = cfg.PlayerSpawnPosition
	spawn.Position = Vector3.new(s[1], s[2], s[3])
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0 -- Short protection is explicitly enforced server-side, never a permanent ForceField.
	spawn.Material = Enum.Material.DiamondPlate
	spawn.Color = Palette.Steel
	spawn.Parent = model
	sign("INSERCION / MANTENGAN LA LINEA", Vector3.new(-77, 10, 102.7),
		Vector3.new(0, 0, -1), 29, Palette.Ice)

	local zombieSpawns = {}
	for index, point in ipairs({
		{ -77, -94 }, { 0, -94 }, { 77, -94 }, { 94, -30 }, { 94, 13 },
		{ 77, 95 }, { 0, 95 }, { -77, 56 }, { -94, 13 }, { -94, -30 },
	}) do
		local marker = part("Breach_" .. index, Vector3.new(2, 1, 2),
			Vector3.new(point[1], 3.2, point[2]), Palette.Red, Enum.Material.SmoothPlastic, spawnFolder)
		marker.Transparency = 1
		marker.CanCollide = false
		marker.CanTouch = false
		marker.CanQuery = false
		marker:SetAttribute("SpawnIndex", index)
		table.insert(zombieSpawns, marker)
	end

	Lighting.ClockTime = cfg.ClockTime
	Lighting.Brightness = cfg.Brightness
	Lighting.Ambient = Color3.fromRGB(65, 75, 87)
	Lighting.OutdoorAmbient = Color3.fromRGB(87, 99, 119)
	Lighting.FogColor = Color3.fromRGB(34, 47, 57)
	Lighting.FogStart = cfg.HalfSize
	Lighting.FogEnd = cfg.FogEnd
	Lighting.GlobalShadows = true
	local correction = Instance.new("ColorCorrectionEffect")
	correction.Name = "BastionGrade"
	correction.Brightness = 0.02
	correction.Contrast = 0.09
	correction.Saturation = -0.15
	correction.TintColor = Color3.fromRGB(221, 232, 243)
	correction.Parent = Lighting
	self.result = { Model = model, SpawnLocation = spawn, ArsenalPart = arsenal, ZombieSpawns = zombieSpawns }
	return self.result
end

return WorldService
