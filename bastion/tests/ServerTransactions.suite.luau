-- Executes production service source via generated dependency-injection wrappers.
-- Only engine APIs are stubbed. Arsenal geometry is explicitly replaced with a gate.
local Config = require("../src/shared/GameConfig")
local Weapons = require("../src/shared/WeaponConfig")
local Rules = require("../src/shared/SessionRules")

return function(factories)
	local assertions = 0
	local function expect(condition, message)
		assertions += 1
		assert(condition, message)
	end
	local function fixture()
		local clock = { now = 100, tasks = {} }
		local rulesReference = {}
		local services = {
			Workspace = { GetServerTimeNow = function() return clock.now end },
			ReplicatedStorage = { Bastion = { Shared = { SessionRules = rulesReference } } },
			Players = {}, RunService = {},
		}
		local runtime = {
			game = { GetService = function(_, name) assert(services[name], "Unexpected engine dependency: " .. name); return services[name] end },
			task = { delay = function(delay, callback) table.insert(clock.tasks, { due = clock.now + delay, callback = callback }) end },
			Random = { new = function() return {} end },
			typeof = function(value) return if type(value) == "table" and value.vectorStub then "Vector3" else typeof(value) end,
			require = function(reference) assert(reference == rulesReference, "Unexpected service require"); return Rules end,
		}
		local function player(id)
			local humanoid = { WalkSpeed = Config.Movement.WalkSpeed, JumpPower = Config.Movement.JumpPower }
			return { UserId = id, Character = { FindFirstChildOfClass = function(_, name) return if name == "Humanoid" then humanoid else nil end } }
		end
		local a, b = player(101), player(202)
		local function record()
			local id = Weapons.StarterWeapon
			local stats = Weapons.GetStats(id)
			return {
				money = Config.Economy.StartingMoney, equipped = id,
				inventory = { [id] = { magazine = stats.MagazineSize, reserve = stats.MaxReserve, levels = Weapons.NewLevels() } },
				alive = true, canInteract = true, reloading = false, reloadToken = 0, reloadEndsAt = 0,
				sprinting = false, crouching = false, ads = false,
				lastShotId = 0, nextFireAt = 0, equipReadyAt = 0,
				damageCarry = 0, kills = 0, headshots = 0, pushes = 0,
			}
		end
		local records = { [a] = record(), [b] = record() }
		services.Players.GetPlayers = function() return { a, b } end
		local data = {
			Get = function(_, p) return records[p] end,
			IsAlive = function(_, p) return records[p] ~= nil and records[p].alive end,
			Push = function(_, p) if records[p] then records[p].pushes += 1 end end,
		}
		local ctx = { Config = Config, WeaponConfig = Weapons, PlayerData = data, Remotes = {}, World = {} }
		local Economy = factories.EconomyService(runtime)
		local Combat = factories.CombatService(runtime)
		local Arsenal = factories.ArsenalService(runtime)
		ctx.Economy, ctx.Combat, ctx.Arsenal = Economy.new(ctx), Combat.new(ctx), Arsenal.new(ctx)
		-- Geometry, distance and movement are engine acceptance cases, not simulated here.
		ctx.Arsenal._CanInteract = function(_, p) return records[p] ~= nil and records[p].alive and records[p].canInteract end
		local function advance(seconds)
			clock.now += seconds
			local tasks = clock.tasks
			clock.tasks = {}
			for _, scheduled in tasks do
				if scheduled.due <= clock.now then scheduled.callback() else table.insert(clock.tasks, scheduled) end
			end
		end
		return {
			ctx = ctx, a = a, b = b, records = records, ra = records[a], rb = records[b], clock = clock,
			advance = advance,
			request = function(p, action, id, key)
				advance(Config.Arsenal.RequestInterval + 0.01)
				return ctx.Arsenal:_Request(p, action, id, key)
			end,
		}
	end

	-- EconomyService: real currency methods, including invalid and capped input.
	do
		local f = fixture()
		local starting = f.ra.money
		for _, invalid in { -1, 1.5, math.huge, -math.huge, 0 / 0, "1", {} } do
			expect(not f.ctx.Economy:Spend(f.a, invalid), "Spend must reject invalid amounts")
			expect(f.ra.money == starting, "Invalid spend must not mutate the balance")
		end
		expect(not f.ctx.Economy:Spend(f.a, starting + 1), "Insufficient funds must be rejected")
		expect(f.ctx.Economy:Spend(f.a, starting), "Exact-balance purchase must succeed")
		expect(f.ra.money == 0 and f.rb.money == starting, "Spending is isolated and cannot go negative")
		for _, invalid in { -1, math.huge, -math.huge, 0 / 0, "1", {} } do
			expect(not f.ctx.Economy:Award(f.a, invalid), "Award must reject invalid amounts")
			expect(f.ra.money == 0, "Invalid award must not mutate money")
		end
		expect(f.ctx.Economy:Award(f.a, 1.9) and f.ra.money == 1, "Awards use integral currency")
		expect(f.ctx.Economy:Award(f.a, Config.Economy.MaxMoney * 2), "Finite award may reach cap")
		expect(f.ra.money == Config.Economy.MaxMoney, "Awards cannot exceed configured money cap")
		local missing = {}
		expect(not f.ctx.Economy:Spend(missing, 0) and not f.ctx.Economy:Award(missing, 1), "Missing players cannot mutate money")
	end
	do
		local f = fixture()
		for _ = 1, 100 do f.ctx.Economy:RewardDamage(f.a, 1, false, false) end
		expect(math.abs(f.ra.money - Config.Economy.StartingMoney + f.ra.damageCarry - 100 * Config.Economy.DamageMoneyPerHP) < 0.000001,
			"Production rewards retain fractional damage credit")
		local prior = f.ra.money
		f.ctx.Economy:RewardDamage(f.a, 10, true, true)
		expect(f.ra.money >= prior + Config.Economy.KillReward + Config.Economy.HeadshotBonus, "Headshot kill rewards configured bonuses")
		expect(f.ra.kills == 1 and f.ra.headshots == 1 and f.rb.kills == 0, "Kill statistics are per player")
		prior = f.ra.money
		for _, invalid in { 0, -1, math.huge, 0 / 0, "1" } do f.ctx.Economy:RewardDamage(f.a, invalid, true, true) end
		expect(f.ra.money == prior and f.ra.kills == 1, "Invalid damage cannot create currency or kills")
	end

	-- ArsenalService: real atomic transactions and independent ownership.
	do
		local f = fixture()
		f.ra.money, f.rb.money = 100000, 100000
		local before = f.ra.money
		expect(f.request(f.a, "Buy", "SMG").ok, "Buying SMG should succeed")
		expect(f.ra.money == before - Weapons.Weapons.SMG.Price and f.ra.equipped == "SMG", "Buy charges official price and equips")
		expect(f.rb.inventory.SMG == nil and f.rb.money == 100000, "Player B must not inherit Player A purchase")
		before = f.ra.money
		expect(not f.request(f.a, "Buy", "SMG").ok and f.ra.money == before, "Duplicate buy must neither charge nor duplicate inventory")
		expect(f.request(f.b, "Buy", "SMG").ok, "Both players can own the same weapon independently")
		expect(f.ra.inventory.SMG ~= f.rb.inventory.SMG and f.ra.inventory.SMG.levels ~= f.rb.inventory.SMG.levels,
			"Weapon and level tables must not be shared")
		expect(not f.request(f.a, "Equip", "DMR").ok and f.ra.equipped == "SMG", "Unowned equip must fail")
		expect(f.request(f.a, "Equip", "Rifle").ok and f.ra.equipped == "Rifle", "Owned equip must succeed")
		before = f.ra.money
		for _, id in { "Unknown", "", 123, {}, false } do
			expect(not f.request(f.a, "Buy", id).ok and f.ra.money == before, "Unknown/malformed weapon must not charge")
		end
		for _, action in { "Unknown", "", 123, {}, false } do
			expect(not f.request(f.a, action, "Rifle").ok and f.ra.money == before, "Unknown/malformed action must not charge")
		end
		f.ra.canInteract = false
		expect(not f.request(f.a, "Buy", "DMR").ok and f.ra.money == before, "Failed interaction gate must prevent purchase")
		f.ra.canInteract, f.ra.alive = true, false
		expect(not f.request(f.a, "Buy", "DMR").ok and f.ra.money == before, "Dead interaction gate must prevent purchase")
		f.ra.alive, f.ra.money = true, 0
		expect(not f.request(f.a, "Buy", "DMR").ok and f.ra.inventory.DMR == nil, "Insufficient funds cannot create ownership")
	end
	do
		local f = fixture()
		f.ra.money = 100000
		local weapon = f.ra.inventory.Rifle
		local before = f.ra.money
		expect(not f.request(f.a, "Ammo", "Rifle").ok and f.ra.money == before, "Full reserve purchase must not charge")
		weapon.reserve, weapon.magazine = 0, 7
		expect(f.request(f.a, "Ammo", "Rifle").ok, "Ammo purchase must refill depleted reserve")
		expect(weapon.reserve == Weapons.Weapons.Rifle.MaxReserve and weapon.magazine == 7, "Ammo purchase does not refill magazine for free")
		expect(f.ra.money == before - Weapons.Weapons.Rifle.AmmoPrice, "Ammo charges official price")
		before = f.ra.money
		expect(not f.ctx.Arsenal:_Request(f.a, "Upgrade", "Rifle", "Damage").ok and f.ra.money == before,
			"Immediate duplicate RPC is throttled")
		for _, key in Weapons.UpgradeOrder do
			for level = 0, Weapons.Upgrades[key].MaxLevel - 1 do
				before = f.ra.money
				local price = Weapons.GetUpgradePrice(key, level)
				expect(f.request(f.a, "Upgrade", "Rifle", key).ok, "Upgrade within cap must succeed")
				expect(weapon.levels[key] == level + 1 and f.ra.money == before - price, "Upgrade charges current level price exactly once")
				expect(f.rb.inventory.Rifle.levels[key] == 0, "Upgrade must be isolated to owner")
			end
			before = f.ra.money
			expect(not f.request(f.a, "Upgrade", "Rifle", key).ok and f.ra.money == before, "Maximum upgrade must not charge")
		end
		expect(weapon.magazine == 7, "Magazine upgrade creates capacity without minting rounds")
		before = f.ra.money
		for _, invalid in { "Unknown", "", 99, {}, false } do
			expect(not f.request(f.a, "Upgrade", "Rifle", invalid).ok and f.ra.money == before, "Malformed upgrade must not charge")
		end
	end

	-- CombatService: production deferred reload callbacks under a deterministic clock.
	do
		local f = fixture()
		local weapon = f.ra.inventory.Rifle
		weapon.magazine, weapon.reserve = 5, 7
		f.ra.sprinting = true
		f.ctx.Combat:_Reload(f.a)
		expect(f.ra.reloading and not f.ra.sprinting, "Reload starts and clears sprint")
		expect(f.ra.reloadEndsAt == f.clock.now + Weapons.Weapons.Rifle.ReloadTime, "Reload completion timestamp is authoritative")
		f.ctx.Combat:_Reload(f.a)
		expect(#f.clock.tasks == 1, "Duplicate reload cannot schedule another transfer")
		f.advance(Weapons.Weapons.Rifle.ReloadTime - 0.01)
		expect(weapon.magazine == 5 and weapon.reserve == 7, "Reload cannot complete before server timer")
		f.advance(0.02)
		expect(weapon.magazine == 12 and weapon.reserve == 0 and not f.ra.reloading, "Reload transfers only available ammo")
		expect(f.ra.reloadEndsAt == 0, "Completed reload clears timestamp")
	end
	for _, cancellation in { "cancel", "equip", "death", "remove", "replacement" } do
		local f = fixture()
		local weapon = f.ra.inventory.Rifle
		weapon.magazine, weapon.reserve = 1, 100
		f.ctx.Combat:_Reload(f.a)
		if cancellation == "cancel" then f.ctx.Combat:CancelReload(f.a)
		elseif cancellation == "equip" then f.ra.equipped = "SMG"
		elseif cancellation == "death" then f.ra.alive = false
		elseif cancellation == "remove" then f.records[f.a] = nil
		elseif cancellation == "replacement" then f.records[f.a] = f.rb end
		f.advance(10)
		expect(weapon.magazine == 1 and weapon.reserve == 100, "Stale reload must not transfer ammo after " .. cancellation)
	end
	do
		local f = fixture()
		f.ra.money = 100000
		local weapon = f.ra.inventory.Rifle
		weapon.magazine, weapon.reserve = 2, 100
		f.ctx.Combat:_Reload(f.a)
		expect(f.request(f.a, "Buy", "SMG").ok and not f.ra.reloading, "Buying/equipping cancels pending reload")
		f.advance(10)
		expect(weapon.magazine == 2 and weapon.reserve == 100, "Canceled old-weapon reload cannot refill after equip")
		f.request(f.a, "Equip", "Rifle")
		f.ctx.Combat:_Reload(f.a)
		expect(f.request(f.a, "Upgrade", "Rifle", "Magazine").ok and not f.ra.reloading, "Equipped upgrade cancels stale-capacity reload")
		f.advance(10)
		expect(weapon.magazine == 2 and weapon.reserve == 100, "Canceled upgrade reload cannot mint ammo")
	end

	-- CombatService early rejection paths run without any raycast/physics stub.
	do
		local f = fixture()
		local weapon = f.ra.inventory.Rifle
		local ammo, money = weapon.magazine, f.ra.money
		for _, id in { 0, -1, 0.5, math.huge, 0 / 0, "1", {}, Config.Combat.MaxShotId + 1 } do
			f.ctx.Combat:_Fire(f.a, id, {}, {})
			expect(f.ra.lastShotId == 0 and weapon.magazine == ammo and f.ra.money == money, "Malformed shot ID cannot fire")
		end
		f.ctx.Combat:_Fire(f.a, 1, {}, {})
		expect(f.ra.lastShotId == 1 and weapon.magazine == ammo, "Malformed vectors are rejected and prediction acknowledged")
		local pushes = f.ra.pushes
		f.ctx.Combat:_Fire(f.a, 1, {}, {})
		expect(f.ra.pushes == pushes and weapon.magazine == ammo, "Replayed shot ID must not trigger another operation")
		local vector = { vectorStub = true, X = 0, Y = 0, Z = -1, Magnitude = 1 }
		local invalid = { vectorStub = true, X = 0 / 0, Y = 0, Z = 0, Magnitude = 1 }
		f.ctx.Combat:_Fire(f.a, 2, invalid, vector)
		expect(weapon.magazine == ammo, "Non-finite camera origin cannot fire")
		f.ctx.Combat:_Fire(f.a, 3, vector, invalid)
		expect(weapon.magazine == ammo, "Non-finite aim cannot fire")
		local length = { vectorStub = true, X = 0, Y = 0, Z = 100, Magnitude = 100 }
		f.ctx.Combat:_Fire(f.a, 4, vector, length)
		expect(weapon.magazine == ammo, "Non-unit aim cannot fire")
		f.ra.alive = false
		f.ctx.Combat:_Fire(f.a, 5, vector, vector)
		expect(weapon.magazine == ammo, "Dead player cannot fire")
		f.ra.alive, f.ra.reloading = true, true
		f.ctx.Combat:_Fire(f.a, 6, vector, vector)
		expect(weapon.magazine == ammo, "Reloading blocks real fire handler")
		f.ra.reloading, f.ra.sprinting = false, true
		f.ctx.Combat:_Fire(f.a, 7, vector, vector)
		expect(weapon.magazine == ammo, "Sprinting blocks real fire handler")
		f.ra.sprinting, f.ra.nextFireAt = false, f.clock.now + 1
		f.ctx.Combat:_Fire(f.a, 8, vector, vector)
		expect(weapon.magazine == ammo, "Fire interval blocks real fire handler")
		f.ra.nextFireAt, f.ra.equipReadyAt = 0, f.clock.now + 1
		f.ctx.Combat:_Fire(f.a, 9, vector, vector)
		expect(weapon.magazine == ammo, "Equip cooldown blocks real fire handler")
		f.ra.equipReadyAt, weapon.magazine = 0, 0
		f.ctx.Combat:_Fire(f.a, 10, vector, vector)
		expect(weapon.magazine == 0 and f.ra.money == money, "Empty weapon cannot damage or reward")
		local acceptedIds = f.ra.lastShotId
		for id = 11, 110 do f.ctx.Combat:_Fire(f.a, id, {}, {}) end
		expect(f.ra.lastShotId < 110 and f.ra.lastShotId >= acceptedIds, "Remote spam exhausts server token bucket")
		expect(f.rb.inventory.Rifle.magazine == ammo and f.rb.money == money, "Malformed shots never alter another player")
	end
	print(string.format("PASS ServerTransactions: %d assertions on production Economy/Arsenal/Combat sources (two-player isolation, upgrades, reload cancellation, remote rejection)", assertions))
	print("ENGINE BOUNDARY: engine APIs stubbed; Arsenal interaction gate substituted. Geometry, accepted raycasts, replication and Studio runtime are not tested here.")
end
