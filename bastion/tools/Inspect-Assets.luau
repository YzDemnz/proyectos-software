local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local reports = {}
for _, file in fs.readDir("assets/incoming") do
	if not file:match("%.rbxm$") then continue end
	local roots = roblox.deserializeModel(fs.readFile("assets/incoming/" .. file))
	local report = { file = file, tree = {}, classes = {}, parts = {} }
	local function visit(node, path, depth)
		local name = path .. "/" .. node.Name
		report.classes[node.ClassName] = (report.classes[node.ClassName] or 0) + 1
		if depth < 4 then table.insert(report.tree, { path = name, class = node.ClassName }) end
		if node:IsA("BasePart") then
			table.insert(report.parts, { path = name, class = node.ClassName, size = {node.Size.X,node.Size.Y,node.Size.Z},
				cframe = {node.CFrame:GetComponents()} })
		end
		for _, child in node:GetChildren() do visit(child, name, depth + 1) end
	end
	for _, root in roots do visit(root, "", 0) end
	table.insert(reports, report)
end
fs.writeFile("artifacts/asset-inspection.json", serde.encode("json", reports, true))
for _, r in reports do print(r.file, serde.encode("json",r.classes)); for _, t in r.tree do print(t.class,t.path) end end
