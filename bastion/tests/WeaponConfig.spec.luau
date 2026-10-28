local WeaponConfig = require("../src/shared/WeaponConfig")
local assertions = 0
local function expect(condition, message)
	assertions += 1
	assert(condition, message)
end
local function approx(a, b)
	return math.abs(a - b) < 0.000001
end

expect(WeaponConfig.Weapons[WeaponConfig.StarterWeapon] ~= nil, "Starter weapon must exist")
expect(WeaponConfig.Weapons[WeaponConfig.StarterWeapon].Price == 0, "Starter weapon must be free")
local first, second = WeaponConfig.NewLevels(), WeaponConfig.NewLevels()
first.Damage = 2
expect(second.Damage == 0, "Players must have independent upgrade state")

for _, id in WeaponConfig.Order do
	local base = WeaponConfig.Weapons[id]
	local levels = WeaponConfig.NewLevels()
	local plain = WeaponConfig.GetStats(id, levels)
	expect(plain.Damage == base.Damage and plain.MagazineSize == base.MagazineSize, "Level zero must match the weapon")
	expect(plain.ADSSpread < plain.HipSpread, "ADS must improve accuracy")
	expect(plain.MaxReserve >= plain.MagazineSize and plain.FireInterval > 0 and plain.Range > 0, "Ammo and firing values must be viable")
	for _, key in WeaponConfig.UpgradeOrder do
		local upgrade = WeaponConfig.Upgrades[key]
		local previousPrice = 0
		local previousStats = plain
		for level = 0, upgrade.MaxLevel - 1 do
			local price = WeaponConfig.GetUpgradePrice(key, level)
			expect(price ~= nil and price > previousPrice and price % 1 == 0, "Upgrade prices must increase at each level")
			previousPrice = price
			levels[key] = level + 1
			local stats = WeaponConfig.GetStats(id, levels)
			expect(stats.ReloadTime > 0 and stats.Recoil > 0 and stats.Damage > 0, "Upgrades must preserve positive stats")
			expect(stats.MagazineSize % 1 == 0 and stats.MagazineSize <= stats.MaxReserve, "Upgraded magazines must stay integral and bounded")
			if key == "Damage" then expect(stats.Damage > previousStats.Damage, "Damage upgrade must increase damage") end
			if key == "Magazine" then expect(stats.MagazineSize > previousStats.MagazineSize, "Magazine upgrade must increase capacity") end
			if key == "Reload" then expect(stats.ReloadTime < previousStats.ReloadTime, "Reload upgrade must decrease time") end
			if key == "Recoil" then expect(stats.Recoil < previousStats.Recoil, "Control upgrade must decrease recoil") end
			previousStats = stats
		end
		expect(WeaponConfig.GetUpgradePrice(key, upgrade.MaxLevel) == nil, "Maximum-level upgrades must not be purchasable")
		expect(WeaponConfig.GetUpgradePrice(key, -1) == nil, "Negative levels must not have a price")
		expect(WeaponConfig.GetUpgradePrice(key, 0.5) == nil, "Fractional levels must not have a price")
		local capped = WeaponConfig.GetStats(id, levels)
		levels[key] = 100000
		local oversized = WeaponConfig.GetStats(id, levels)
		for _, stat in { "Damage", "MagazineSize", "ReloadTime", "Recoil" } do
			expect(approx(capped[stat], oversized[stat]), "Out-of-range levels must clamp to the cap")
		end
		levels[key] = -1000
		local negative = WeaponConfig.GetStats(id, levels)
		levels[key] = 0
		local zero = WeaponConfig.GetStats(id, levels)
		for _, stat in { "Damage", "MagazineSize", "ReloadTime", "Recoil" } do
			expect(approx(negative[stat], zero[stat]), "Negative levels must clamp to zero")
		end
	end
	expect(WeaponConfig.Weapons[id].Damage == base.Damage and base.MagazineSize == plain.MagazineSize, "Stat calculation must not mutate definitions")
end

expect(WeaponConfig.GetUpgradePrice("Bogus", 0) == nil, "Unknown upgrade must be rejected")
expect(not pcall(function() WeaponConfig.GetStats("Bogus") end), "Unknown weapon must be rejected")
expect(WeaponConfig.ZoneMultipliers.Head > WeaponConfig.ZoneMultipliers.Torso, "Headshots must deal bonus damage")
expect(WeaponConfig.ZoneMultipliers["Left Leg"] < WeaponConfig.ZoneMultipliers.Torso, "Limb shots must deal reduced damage")
print(string.format("PASS WeaponConfig: %d assertions (caps, price growth, stat bounds, headshots, isolated levels)", assertions))
