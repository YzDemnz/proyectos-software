local Rules = require("../src/shared/SessionRules")
local Config = require("../src/shared/GameConfig")
local Weapons = require("../src/shared/WeaponConfig")
local assertions = 0
local function expect(condition, message)
	assertions += 1
	assert(condition, message)
end

for _, invalid in { 0 / 0, math.huge, -math.huge, "10", {}, true } do
	expect(not Rules.IsFinite(invalid), "Remote numeric validation must reject non-finite/non-numeric input")
	expect(not Rules.IsInteger(invalid, 0, 100), "Remote integer validation must reject invalid input")
end
expect(Rules.IsInteger(1, 1, 10) and Rules.IsInteger(10, 1, 10), "Integer bounds are inclusive")
for _, invalid in { -1, 0, 10.1, 11 } do
	expect(not Rules.IsInteger(invalid, 1, 10), "Out-of-range/fractional shot IDs must fail")
end

local bucket = { tokens = Config.Combat.RemoteBurst, time = 0 }
for _ = 1, Config.Combat.RemoteBurst do expect(Rules.TakeToken(bucket, 0, Config.Combat.MaxRemoteRate, Config.Combat.RemoteBurst), "Initial remote burst should be permitted") end
expect(not Rules.TakeToken(bucket, 0, Config.Combat.MaxRemoteRate, Config.Combat.RemoteBurst), "Exhausted remote burst must fail")
expect(Rules.TakeToken(bucket, 1, Config.Combat.MaxRemoteRate, Config.Combat.RemoteBurst), "Elapsed time refills tokens")
expect(bucket.tokens <= Config.Combat.RemoteBurst, "Token bucket must not exceed capacity")
expect(Rules.TakeToken(bucket, 100000, Config.Combat.MaxRemoteRate, Config.Combat.RemoteBurst), "Long idle time recovers a token")
expect(bucket.tokens == Config.Combat.RemoteBurst - 1, "Long idle time must cap the bucket")

local stats = Weapons.GetStats(Weapons.StarterWeapon)
local record = {
	alive = true, reloading = false, sprinting = false,
	equipped = Weapons.StarterWeapon, nextFireAt = 1, equipReadyAt = 0,
	inventory = { [Weapons.StarterWeapon] = { magazine = stats.MagazineSize, reserve = stats.MaxReserve } },
}
expect(Rules.CanFire(record, 1, stats, 0), "Ready alive player can fire")
expect(not Rules.CanFire(record, 0.9, stats, 0.015), "Rapid fire must fail")
record.equipReadyAt = 2
expect(not Rules.CanFire(record, 1, stats, 0.015), "Weapon switch cannot bypass equip delay")
record.equipReadyAt = 0
for _, flag in { "reloading", "sprinting" } do
	record[flag] = true
	expect(not Rules.CanFire(record, 1, stats, 0.015), "Reload/sprint must block firing")
	record[flag] = false
end
record.alive = false
expect(not Rules.CanFire(record, 1, stats, 0.015), "Dead players cannot fire")
record.alive = true
record.inventory[record.equipped].magazine = 0
expect(not Rules.CanFire(record, 1, stats, 0.015), "Empty magazines cannot fire")
record.equipped = "Unknown"
expect(not Rules.CanFire(record, 1, stats, 0.015), "Unowned weapons cannot fire")

for _, id in Weapons.Order do
	local weaponStats = Weapons.GetStats(id)
	for magazine = 0, weaponStats.MagazineSize do
		for _, reserve in { 0, 1, 7, weaponStats.MaxReserve } do
			local filled, remaining = Rules.ReloadTransfer(magazine, reserve, weaponStats.MagazineSize)
			expect(filled + remaining == magazine + reserve, "Reload must conserve total ammunition")
			expect(filled <= weaponStats.MagazineSize and remaining >= 0 and filled >= magazine, "Reload cannot overfill or create negative ammunition")
			expect(filled == weaponStats.MagazineSize or remaining == 0, "Reload fills magazine when reserve allows")
		end
	end
end

local cumulative, carry = 0, 0
for _ = 1, 100 do
	local reward
	reward, carry = Rules.Reward(1, false, false, Config.Economy, carry)
	cumulative += reward
	expect(carry >= 0 and carry < 1, "Damage reward carry remains fractional")
end
expect(math.abs(cumulative + carry - 100 * Config.Economy.DamageMoneyPerHP) < 0.000001, "Small hits retain full accumulated reward")
local bodyKill = Rules.Reward(10, true, false, Config.Economy, 0)
local headKill = Rules.Reward(10, true, true, Config.Economy, 0)
expect(headKill - bodyKill == Config.Economy.HeadshotBonus, "Headshot kill awards configured bonus exactly once")
expect(bodyKill >= Config.Economy.KillReward, "Kills award configured kill money")
expect(Rules.Reward(10, false, true, Config.Economy, 0) == Rules.Reward(10, false, false, Config.Economy, 0), "Nonlethal headshots do not award a kill bonus")
expect(Rules.Reward(-100, false, false, Config.Economy, 0) == 0, "Negative damage cannot subtract money")

for players = 1, 8 do
	local previous = 0
	for round = 1, 100 do
		local count = Rules.WaveCount(round, players, Config.Wave)
		expect(count >= previous and count <= Config.Wave.MaxWaveCount, "Wave size grows monotonically to the configured cap")
		expect(count % 1 == 0 and count > 0, "Waves have positive integer counts")
		previous = count
	end
end
expect(Rules.WaveCount(1, 2, Config.Wave) > Rules.WaveCount(1, 1, Config.Wave), "Additional players increase wave count")
print(string.format("PASS SessionRules: %d assertions (remote validation, rate limits, fire gating, ammunition conservation, rewards, waves)", assertions))
