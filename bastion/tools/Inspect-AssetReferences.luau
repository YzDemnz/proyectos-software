-- Offline audit only. Deserializes files as data and never executes contained scripts.
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local refs = {}
local byAsset = {}
local propertyMap = {
	MeshPart = { "MeshId", "TextureID" },
	SpecialMesh = { "MeshId", "TextureId" },
	SurfaceAppearance = { "ColorMap", "MetalnessMap", "NormalMap", "RoughnessMap" },
	MaterialVariant = { "ColorMap", "MetalnessMap", "NormalMap", "RoughnessMap" },
}
for _, file in fs.readDir("assets/incoming") do
	if not file:match("%.rbxm$") then continue end
	local roots = roblox.deserializeModel(fs.readFile("assets/incoming/" .. file))
	byAsset[file] = {}
	local function visit(instance, path)
		local currentPath = path .. "/" .. instance.Name
		for _, property in propertyMap[instance.ClassName] or {} do
			local ok, value = pcall(function() return instance[property] end)
			if ok then
				local text = tostring(value)
				local id = text:match("rbxassetid://(%d+)") or text:match("[?&]id=(%d+)")
				if id then
					if not refs[id] then refs[id] = { id = id, uses = {} } end
					table.insert(refs[id].uses, { asset = file, path = currentPath, property = property })
					byAsset[file][id] = true
				end
			end
		end
		for _, child in instance:GetChildren() do visit(child, currentPath) end
	end
	for _, root in roots do visit(root, "") end
end
local references = {}
for _, reference in refs do table.insert(references, reference) end
table.sort(references, function(a, b) return tonumber(a.id) < tonumber(b.id) end)
fs.writeFile("artifacts/asset-references.json", serde.encode("json", { references = references, byAsset = byAsset }, true))
print("Unique mesh/PBR references:", #references)
