--!nonstrict
local PathfindingService = game:GetService("PathfindingService")
local PhysicsService = game:GetService("PhysicsService")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local Debris = game:GetService("Debris")

local ZombieService = {}
ZombieService.__index = ZombieService
local GROUP = "BastionZombies"

function ZombieService.new(ctx)
	return setmetatable({ ctx = ctx, records = {}, aliveCount = 0, serial = 0,
		activePaths = 0, generation = 0, accumulator = 0, random = Random.new() }, ZombieService)
end

function ZombieService:Start()
	if self.started then return end
	self.started = true
	pcall(function() PhysicsService:RegisterCollisionGroup(GROUP) end)
	PhysicsService:CollisionGroupSetCollidable(GROUP, GROUP, false)
	local folder = Instance.new("Folder")
	folder.Name = "BastionZombies"
	folder.Parent = Workspace
	self.folder = folder
	self.connection = RunService.Heartbeat:Connect(function(dt)
		self.accumulator += dt
		if self.accumulator < self.ctx.Config.Zombie.ThinkInterval then return end
		local elapsed = self.accumulator
		self.accumulator = 0
		self:_think(elapsed)
	end)
end

local function rig(position, number, health, speed)
	local model = Instance.new("Model")
	model.Name = "BreachWalker_" .. number
	model:SetAttribute("Enemy", true)
	local function body(name, size, offset, color, collidable)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.CFrame = CFrame.new(position + offset)
		p.Color = color
		p.Material = Enum.Material.SmoothPlastic
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.CanCollide = collidable or false
		p.CanTouch = false
		p.CollisionGroup = GROUP
		p.Massless = name ~= "HumanoidRootPart"
		p.Parent = model
		return p
	end
	local skin = Color3.fromRGB(117, 137, 109)
	local uniform = number % 2 == 0 and Color3.fromRGB(63, 74, 67) or Color3.fromRGB(83, 72, 59)
	local root = body("HumanoidRootPart", Vector3.new(2, 2, 1), Vector3.zero, uniform, false)
	root.Transparency = 1
	root.CanQuery = false
	local torso = body("Torso", Vector3.new(2, 2, 1), Vector3.zero, uniform, true)
	local head = body("Head", Vector3.new(2, 1, 1), Vector3.new(0, 1.5, 0), skin, false)
	local leftArm = body("Left Arm", Vector3.new(1, 2, 1), Vector3.new(-1.5, 0, 0), skin, false)
	local rightArm = body("Right Arm", Vector3.new(1, 2, 1), Vector3.new(1.5, 0, 0), skin, false)
	local leftLeg = body("Left Leg", Vector3.new(1, 2, 1), Vector3.new(-0.5, -2, 0), uniform, true)
	local rightLeg = body("Right Leg", Vector3.new(1, 2, 1), Vector3.new(0.5, -2, 0), uniform, true)
	local motors = {}
	local function joint(name, part0, part1, c0, c1)
		local motor = Instance.new("Motor6D")
		motor.Name = name
		motor.Part0 = part0
		motor.Part1 = part1
		motor.C0 = c0
		motor.C1 = c1 or CFrame.identity
		motor.Parent = part0
		motors[name] = { motor = motor, base = c0 }
	end
	joint("RootJoint", root, torso, CFrame.identity)
	joint("Neck", torso, head, CFrame.new(0, 1, 0), CFrame.new(0, -0.5, 0))
	joint("Left Shoulder", torso, leftArm, CFrame.new(-1.5, 0.5, 0), CFrame.new(0, 0.5, 0))
	joint("Right Shoulder", torso, rightArm, CFrame.new(1.5, 0.5, 0), CFrame.new(0, 0.5, 0))
	joint("Left Hip", torso, leftLeg, CFrame.new(-0.5, -1, 0), CFrame.new(0, 1, 0))
	joint("Right Hip", torso, rightLeg, CFrame.new(0.5, -1, 0), CFrame.new(0, 1, 0))
	-- Eyes are part of the head's visual silhouette but do not intercept damage raycasts.
	for _, x in ipairs({ -0.43, 0.43 }) do
		local eye = body("Eye", Vector3.new(0.25, 0.16, 0.08), Vector3.new(x, 1.6, -0.53),
			Color3.fromRGB(255, 180, 87), false)
		eye.Material = Enum.Material.Neon
		eye.CanQuery = false
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = head
		weld.Part1 = eye
		weld.Parent = eye
	end
	local humanoid = Instance.new("Humanoid")
	humanoid.Name = "Humanoid"
	humanoid.MaxHealth = health
	humanoid.Health = health
	humanoid.WalkSpeed = speed
	humanoid.HipHeight = 0
	humanoid.AutoRotate = true
	humanoid.BreakJointsOnDeath = false
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Climbing, false)
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Swimming, false)
	humanoid.Parent = model
	model.PrimaryPart = root
	return model, root, head, humanoid, motors
end

function ZombieService:Spawn(round, playerCount)
	if not self.started then return false end
	local cfg = self.ctx.Config.Zombie
	if self.aliveCount >= self.ctx.Config.Wave.HardMaxAlive then return false end
	local players = self.ctx.PlayerData:GetAlivePlayers()
	if #players == 0 then return false end
	local candidates = {}
	local now = Workspace:GetServerTimeNow()
	local minimumDistance = cfg.SpawnMinDistance
	if self.spawnFailedAt and now - self.spawnFailedAt >= cfg.SpawnFailureTimeout then
		minimumDistance = cfg.SpawnEmergencyDistance
	end
	for _, marker in ipairs(self.ctx.World.ZombieSpawns) do
		local nearest = math.huge
		for _, player in ipairs(players) do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if root then nearest = math.min(nearest, (root.Position - marker.Position).Magnitude) end
		end
		if nearest >= minimumDistance and nearest <= cfg.SpawnMaxDistance then
			table.insert(candidates, marker)
		end
	end
	if #candidates == 0 then
		self.spawnFailedAt = self.spawnFailedAt or now
		return false
	end
	self.spawnFailedAt = nil
	local marker = candidates[self.random:NextInteger(1, #candidates)]
	local health = math.min(cfg.MaxHealth, (cfg.BaseHealth + cfg.HealthPerRound * (round - 1))
		* (1 + math.max(0, playerCount - 1) * cfg.HealthPerExtraPlayer))
	local speed = math.min(cfg.MaxSpeed, cfg.BaseSpeed + cfg.SpeedPerRound * (round - 1))
	self.serial += 1
	local model, root, head, humanoid, motors = rig(marker.Position, self.serial, health, speed)
	model.Parent = self.folder
	-- A single connected assembly owns every body part; clients never simulate enemy physics.
	root:SetNetworkOwner(nil)
	self.records[model] = { model = model, root = root, head = head, humanoid = humanoid, motors = motors,
		bornAt = now, nextTargetAt = 0, nextPathAt = 0, nextAttackAt = 0,
		lastMovedAt = now, lastPosition = root.Position, recoveries = 0,
		damage = math.min(cfg.MaxDamage, cfg.BaseDamage + cfg.DamagePerRound * (round - 1)),
		pathPending = false, waypoint = 1, target = nil, seed = self.serial }
	self.aliveCount += 1
	return true
end

function ZombieService:GetAliveCount()
	return self.aliveCount
end

function ZombieService:GetModelFromHit(instance)
	local cursor = instance
	while cursor and cursor ~= self.folder and cursor ~= Workspace do
		if self.records[cursor] then return cursor end
		cursor = cursor.Parent
	end
	return nil
end

function ZombieService:_retire(record)
	if self.records[record.model] ~= record then return end
	-- Removal is synchronous and precedes Humanoid death: repeated hits cannot award a second kill.
	self.records[record.model] = nil
	self.aliveCount -= 1
	record.humanoid.Health = 0
	record.model:SetAttribute("Enemy", false)
	for _, descendant in ipairs(record.model:GetDescendants()) do
		if descendant:IsA("BasePart") then
			descendant.CanCollide = false
			descendant.CanQuery = false
			descendant.Anchored = true
		end
	end
	local hip = record.motors.RootJoint
	if hip then hip.motor.C0 = hip.base * CFrame.Angles(math.rad(-70), 0, 0) end
	Debris:AddItem(record.model, self.ctx.Config.Zombie.CorpseLifetime)
end

function ZombieService:Damage(model, amount)
	local record = self.records[model]
	if not record or not record.model.Parent or amount ~= amount or amount <= 0 or amount == math.huge then
		return 0, false
	end
	local actual = math.min(amount, record.humanoid.Health)
	if actual <= 0 then return 0, false end
	local killed = actual >= record.humanoid.Health
	if killed then self:_retire(record) else record.humanoid.Health -= actual end
	return actual, killed
end

function ZombieService:Clear()
	self.generation += 1
	self.records = {}
	self.aliveCount = 0
	self.spawnFailedAt = nil
	if self.folder then self.folder:ClearAllChildren() end
	-- Running ComputeAsync requests finish naturally and are discarded by the generation guard.
end

function ZombieService:Destroy()
	if self.connection then self.connection:Disconnect(); self.connection = nil end
	self.started = false
	self:Clear()
	if self.folder then self.folder:Destroy(); self.folder = nil end
end

function ZombieService:_targetRoot(player, now)
	if not player or not self.ctx.PlayerData:IsAlive(player) then return nil end
	if (player:GetAttribute("SpawnProtectedUntil") or 0) > now then return nil end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 then return nil end
	return root, humanoid
end

function ZombieService:_lineOfSight(record, targetRoot)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { self.folder }
	params.IgnoreWater = true
	local vector = targetRoot.Position - record.root.Position
	local result = Workspace:Raycast(record.root.Position, vector, params)
	return not result or result.Instance:IsDescendantOf(targetRoot.Parent)
end

function ZombieService:_requestPath(record, destination, now)
	local cfg = self.ctx.Config.Zombie
	if record.pathPending or now < record.nextPathAt or self.activePaths >= cfg.MaxConcurrentPaths
		or self.pathRequestsThisTick >= cfg.MaxPathRequestsPerTick then return end
	record.pathPending = true
	record.nextPathAt = now + cfg.PathInterval
	self.pathRequestsThisTick += 1
	self.activePaths += 1
	local generation = self.generation
	local origin = record.root.Position
	local targetPlayer = record.target
	task.spawn(function()
		local path = PathfindingService:CreatePath({ AgentRadius = cfg.AgentRadius,
			AgentHeight = cfg.AgentHeight, AgentCanJump = true, AgentCanClimb = false,
			WaypointSpacing = cfg.WaypointSpacing })
		local success = pcall(function() path:ComputeAsync(origin, destination) end)
		self.activePaths = math.max(0, self.activePaths - 1)
		record.pathPending = false
		if generation ~= self.generation or self.records[record.model] ~= record
			or record.target ~= targetPlayer then
			path:Destroy()
			return
		end
		if success and path.Status == Enum.PathStatus.Success then
			record.waypoints = path:GetWaypoints()
			record.waypoint = math.min(2, #record.waypoints)
			record.pathDestination = destination
		else
			record.waypoints = nil
		end
		path:Destroy()
	end)
end

function ZombieService:_animate(record, now, attacking)
	local cfg = self.ctx.Config.Zombie
	local walking = record.root.AssemblyLinearVelocity.Magnitude > 1
	local swing = walking and math.sin(now * cfg.AnimationRate + record.seed) * cfg.AnimationAmplitude or 0
	local function pose(name, x, z)
		local joint = record.motors[name]
		joint.motor.C0 = joint.base * CFrame.Angles(x, 0, z or 0)
	end
	pose("Left Hip", swing)
	pose("Right Hip", -swing)
	pose("Left Shoulder", attacking and -1.4 or -0.65 - swing * 0.35, -0.12)
	pose("Right Shoulder", attacking and -1.4 or -0.65 + swing * 0.35, 0.12)
	pose("Neck", 0.05 * math.sin(now * 2 + record.seed))
end

function ZombieService:_think(_elapsed)
	local cfg = self.ctx.Config.Zombie
	local now = Workspace:GetServerTimeNow()
	local players = self.ctx.PlayerData:GetAlivePlayers()
	self.pathRequestsThisTick = 0
	for _, record in pairs(self.records) do
		if not record.model.Parent or record.humanoid.Health <= 0 or record.root.Position.Y < self.ctx.Config.World.KillY
			or now - record.bornAt > cfg.MaxLifetime then
			self:_retire(record)
			continue
		end
		if now >= record.nextTargetAt or not self:_targetRoot(record.target, now) then
			local target, nearest = nil, math.huge
			for _, player in ipairs(players) do
				local root = self:_targetRoot(player, now)
				local distance = root and (root.Position - record.root.Position).Magnitude or math.huge
				if distance < nearest then target, nearest = player, distance end
			end
			if record.target ~= target then
				record.waypoints = nil
				record.attack = nil
				record.nextPathAt = 0
			end
			record.target = target
			record.nextTargetAt = now + cfg.RetargetInterval
		end
		local targetRoot, targetHumanoid = self:_targetRoot(record.target, now)
		if not targetRoot then
			record.humanoid:MoveTo(record.root.Position)
			record.attack = nil
			record.lastMovedAt = now
			self:_animate(record, now, false)
			continue
		end
		local distance = (targetRoot.Position - record.root.Position).Magnitude
		local visible = self:_lineOfSight(record, targetRoot)
		if record.attack then
			if now >= record.attack.hitAt then
				-- Revalidate range, life, protection, the exact target, and occlusion at impact time.
				if record.target == record.attack.target and distance <= cfg.AttackRange and visible
					and self:_targetRoot(record.attack.target, now) then
					targetHumanoid:TakeDamage(record.damage)
				end
				record.attack = nil
			end
		elseif distance <= cfg.AttackRange and visible and now >= record.nextAttackAt then
			record.attack = { target = record.target, hitAt = now + cfg.AttackWindup }
			record.nextAttackAt = now + cfg.AttackCooldown
		end
		if record.attack or (distance <= cfg.AttackRange * 0.75 and visible) then
			record.humanoid:MoveTo(record.root.Position)
			record.lastMovedAt = now
		elseif visible then
			record.humanoid:MoveTo(targetRoot.Position)
			record.waypoints = nil
		else
			if not record.pathDestination or (record.pathDestination - targetRoot.Position).Magnitude >= cfg.PathTargetMoved
				or not record.waypoints or now >= record.nextPathAt then
				self:_requestPath(record, targetRoot.Position, now)
			end
			local waypoints = record.waypoints
			if waypoints then
				while waypoints[record.waypoint] do
					local offset = waypoints[record.waypoint].Position - record.root.Position
					-- Navigation waypoints lie on the floor; a humanoid root remains roughly 3 studs above it.
					if Vector2.new(offset.X, offset.Z).Magnitude > cfg.WaypointReach
						or math.abs(offset.Y) > cfg.AgentHeight then break end
					record.waypoint += 1
				end
				local waypoint = waypoints[record.waypoint]
				if waypoint then
					if waypoint.Action == Enum.PathWaypointAction.Jump then record.humanoid.Jump = true end
					record.humanoid:MoveTo(waypoint.Position)
				else
					record.waypoints = nil
				end
			else
				-- This safe fallback may meet a wall; the next bounded path request or stuck recovery replaces it.
				record.humanoid:MoveTo(targetRoot.Position)
			end
		end
		if (record.root.Position - record.lastPosition).Magnitude >= cfg.StuckMoveThreshold then
			record.lastPosition = record.root.Position
			record.lastMovedAt = now
			record.recoveries = 0
		elseif now - record.lastMovedAt >= cfg.StuckTimeout then
			record.recoveries += 1
			record.lastMovedAt = now
			record.nextPathAt = 0
			record.waypoints = nil
			record.humanoid.Jump = true
			if record.recoveries >= cfg.MaxStuckRecoveries then
				-- No teleporting onto players and no immortal straggler keeping a wave open.
				self:_retire(record)
				continue
			end
		end
		self:_animate(record, now, record.attack ~= nil)
	end
end

return ZombieService
