--!nonstrict
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local WaveService = {}
WaveService.__index = WaveService

function WaveService.new(ctx)
	return setmetatable({ ctx = ctx, phase = "Waiting", round = 0, unspawned = 0,
		accumulator = 0, deadline = 0, nextSpawnAt = 0, spawnFailedAt = nil }, WaveService)
end

function WaveService:_publish()
	local remaining = self.phase == "Active" and (self.unspawned + self.ctx.Zombies:GetAliveCount()) or 0
	local values = { Round = self.round, WavePhase = self.phase, ZombiesRemaining = remaining,
		NextWaveAt = self.deadline }
	for name, value in pairs(values) do
		if Workspace:GetAttribute(name) ~= value then Workspace:SetAttribute(name, value) end
	end
end

function WaveService:_intermission(now, first)
	self.phase = "Intermission"
	self.deadline = now + (first and self.ctx.Config.Wave.FirstIntermission or self.ctx.Config.Wave.Intermission)
	self.unspawned = 0
	self.spawnFailedAt = nil
	self:_publish()
	self.ctx.PlayerData:RespawnDead()
end

function WaveService:_defeat(now, message)
	self.phase = "Defeat"
	self.deadline = now + self.ctx.Config.Wave.DefeatDelay
	self.unspawned = 0
	self.spawnFailedAt = nil
	self.ctx.Zombies:Clear()
	self:_publish()
	if message then self.ctx.Remotes.CombatFX:FireAllClients({ kind = "Notice", message = message }) end
end

function WaveService:_beginWave(now, playerCount)
	local cfg = self.ctx.Config.Wave
	self.round += 1
	self.phase = "Active"
	self.deadline = 0
	self.wavePlayerCount = math.max(1, playerCount)
	self.unspawned = math.min(cfg.MaxWaveCount, cfg.BaseCount + (self.round - 1) * cfg.CountPerRound
		+ (self.wavePlayerCount - 1) * cfg.CountPerExtraPlayer)
	self.spawnFailedAt = nil
	self.nextSpawnAt = now
	self:_publish()
end

function WaveService:_tick()
	local now = Workspace:GetServerTimeNow()
	local playerCount = #Players:GetPlayers()
	if playerCount == 0 then
		if self.phase ~= "Waiting" or self.ctx.Zombies:GetAliveCount() > 0 then
			self.phase = "Waiting"
			self.round = 0
			self.deadline = 0
			self.unspawned = 0
			self.spawnFailedAt = nil
			self.ctx.Zombies:Clear()
		end
		self:_publish()
		return
	end
	local alivePlayers = self.ctx.PlayerData:GetAlivePlayers()
	if self.phase == "Waiting" then
		-- Initial character creation and reset respawns are asynchronous. Wait for one valid character.
		if #alivePlayers > 0 then self:_intermission(now, true) end
		return
	end
	if self.phase == "Defeat" then
		if now >= self.deadline then
			self.phase = "Waiting"
			self.round = 0
			self.deadline = 0
			self:_publish()
			self.ctx.PlayerData:ResetRun()
		end
		return
	end
	if #alivePlayers == 0 then
		self:_defeat(now, "Equipo caido. Preparando una nueva insercion.")
		return
	end
	if self.phase == "Intermission" then
		if now >= self.deadline then self:_beginWave(now, playerCount) end
		return
	end
	if self.phase == "Active" then
		local cfg = self.ctx.Config.Wave
		local living = self.ctx.Zombies:GetAliveCount()
		local aliveLimit = math.min(cfg.HardMaxAlive,
			cfg.MaxAlive + math.max(0, #alivePlayers - 1) * cfg.ExtraAlivePerPlayer)
		if self.unspawned > 0 and living < aliveLimit and now >= self.nextSpawnAt then
			local spawned = self.ctx.Zombies:Spawn(self.round, self.wavePlayerCount)
			self.nextSpawnAt = now + math.max(cfg.MinSpawnInterval,
				cfg.SpawnInterval - (self.round - 1) * cfg.SpawnIntervalReduction)
			if spawned then
				self.unspawned -= 1
				self.spawnFailedAt = nil
			else
				self.spawnFailedAt = self.spawnFailedAt or now
				if now - self.spawnFailedAt >= cfg.SpawnStallTimeout then
					self:_defeat(now, "Las rutas de entrada estan bloqueadas. Reubicando al equipo.")
					return
				end
			end
		end
		if self.unspawned == 0 and self.ctx.Zombies:GetAliveCount() == 0 then
			for _, player in ipairs(alivePlayers) do
				self.ctx.Economy:Award(player, self.ctx.Config.Economy.WaveReward)
			end
			self:_intermission(now, false)
		else
			self:_publish()
		end
	end
end

function WaveService:Start()
	if self.started then return end
	self.started = true
	self:_publish()
	self.connection = RunService.Heartbeat:Connect(function(dt)
		self.accumulator += dt
		if self.accumulator < self.ctx.Config.Wave.TickInterval or self.ticking then return end
		self.accumulator = 0
		-- Guard even if a future PlayerData spawn implementation yields.
		self.ticking = true
		local ok, message = xpcall(function() self:_tick() end, debug.traceback)
		self.ticking = false
		if not ok then warn("[Bastion/Waves] " .. tostring(message)) end
	end)
end

function WaveService:Destroy()
	if self.connection then self.connection:Disconnect(); self.connection = nil end
	self.started = false
end

return WaveService
