-- Read-only inspection of quarantined model data; no imported Lua is executed.
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local records = {}
for _, source in {
	{ id = 4842207161, name = "AR" },
	{ id = 119916677125479, name = "SMG" },
	{ id = 4842218829, name = "Sniper" },
} do
	local roots = roblox.deserializeModel(fs.readFile("assets/incoming/" .. source.id .. ".rbxm"))
	local model = roots[1]:FindFirstChild(source.name)
	assert(model and model:IsA("Model"), source.name)
	local record = { id = source.id, model = model.Name, parts = {}, attachments = {} }
	local primary = model.PrimaryPart
	assert(primary, "missing PrimaryPart")
	record.primary = primary.Name
	for _, node in model:GetDescendants() do
		if node:IsA("BasePart") then
			local cf = primary.CFrame:ToObjectSpace(node.CFrame)
			table.insert(record.parts, {name = node.Name, class = node.ClassName, size = { node.Size.X, node.Size.Y, node.Size.Z },
				cf = { cf:GetComponents() }, transparency = node.Transparency})
		elseif node:IsA("Attachment") and node.Parent:IsA("BasePart") then
			local cf = primary.CFrame:ToObjectSpace(node.Parent.CFrame * node.CFrame)
			table.insert(record.attachments, {name = node.Name, parent = node.Parent.Name, cf = { cf:GetComponents() }})
		end
	end
	table.insert(records, record)
end
fs.writeFile("artifacts/weapon-source-axes.json", serde.encode("json", records, true))
for _, record in records do print(serde.encode("json", record, true)) end
