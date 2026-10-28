--!strict
export type Levels = { Damage: number, Magazine: number, Reload: number, Recoil: number, [string]: number }
export type WeaponDefinition = {
	Id: string, Name: string, Price: number, AmmoPrice: number,
	Damage: number, MagazineSize: number, MaxReserve: number, FireInterval: number,
	ReloadTime: number, Range: number, Recoil: number, HipSpread: number, ADSSpread: number,
	Automatic: boolean, Color: { number },
}
export type WeaponStats = {
	Id: string, Name: string, Damage: number, MagazineSize: number, MaxReserve: number,
	FireInterval: number, ReloadTime: number, Recoil: number, Range: number,
	HipSpread: number, ADSSpread: number, Automatic: boolean,
}
export type UpgradeDefinition = { Name: string, BasePrice: number, PriceGrowth: number, MaxLevel: number, Step: number }
local Weapons: { [string]: WeaponDefinition } = {
	Rifle = {
		Id = "Rifle", Name = "AR-41 GUARD", Price = 0, AmmoPrice = 180,
		Damage = 29, MagazineSize = 30, MaxReserve = 180, FireInterval = 0.115,
		ReloadTime = 2.3, Range = 260, Recoil = 1.3, HipSpread = 1.25, ADSSpread = 0.18,
		Automatic = true, Color = { 0.21, 0.25, 0.25 },
	},
	SMG = {
		Id = "SMG", Name = "KITE-9", Price = 1200, AmmoPrice = 220,
		Damage = 22, MagazineSize = 36, MaxReserve = 216, FireInterval = 0.075,
		ReloadTime = 1.8, Range = 190, Recoil = 0.95, HipSpread = 1.7, ADSSpread = 0.3,
		Automatic = true, Color = { 0.18, 0.23, 0.29 },
	},
	DMR = {
		Id = "DMR", Name = "SENTRY-6", Price = 2100, AmmoPrice = 250,
		Damage = 68, MagazineSize = 12, MaxReserve = 96, FireInterval = 0.34,
		ReloadTime = 2.7, Range = 320, Recoil = 2.5, HipSpread = 1.8, ADSSpread = 0.06,
		Automatic = false, Color = { 0.31, 0.27, 0.2 },
	},
}
local Upgrades: { [string]: UpgradeDefinition } = {
	Damage = { Name = "Daño", BasePrice = 450, PriceGrowth = 1.75, MaxLevel = 4, Step = 0.2 },
	Magazine = { Name = "Cargador", BasePrice = 350, PriceGrowth = 1.7, MaxLevel = 4, Step = 0.2 },
	Reload = { Name = "Recarga", BasePrice = 400, PriceGrowth = 1.7, MaxLevel = 4, Step = 0.12 },
	Recoil = { Name = "Control", BasePrice = 300, PriceGrowth = 1.65, MaxLevel = 4, Step = 0.14 },
}
local WeaponConfig = {
	StarterWeapon = "Rifle",
	Order = { "Rifle", "SMG", "DMR" },
	UpgradeOrder = { "Damage", "Magazine", "Reload", "Recoil" },
	Weapons = Weapons, Upgrades = Upgrades,
	ZoneMultipliers = { Head = 2.25, Torso = 1, HumanoidRootPart = 1,
		["Left Arm"] = 0.75, ["Right Arm"] = 0.75, ["Left Leg"] = 0.7, ["Right Leg"] = 0.7 },
}
function WeaponConfig.NewLevels(): Levels
	return { Damage = 0, Magazine = 0, Reload = 0, Recoil = 0 }
end
function WeaponConfig.GetStats(id: string, levels: Levels?): WeaponStats
	local base = Weapons[id]
	assert(base, "Unknown weapon")
	local lv = levels or WeaponConfig.NewLevels()
	local function level(key: string): number
		return math.clamp(math.floor(lv[key] or 0), 0, Upgrades[key].MaxLevel)
	end
	return {
		Id = id, Name = base.Name, Damage = base.Damage * (1 + Upgrades.Damage.Step * level("Damage")),
		MagazineSize = math.floor(base.MagazineSize * (1 + Upgrades.Magazine.Step * level("Magazine"))),
		MaxReserve = base.MaxReserve, FireInterval = base.FireInterval,
		ReloadTime = base.ReloadTime * (1 - Upgrades.Reload.Step * level("Reload")),
		Recoil = base.Recoil * (1 - Upgrades.Recoil.Step * level("Recoil")),
		Range = base.Range, HipSpread = base.HipSpread, ADSSpread = base.ADSSpread,
		Automatic = base.Automatic,
	}
end
function WeaponConfig.GetUpgradePrice(key: string, currentLevel: number): number?
	local upgrade = Upgrades[key]
	if not upgrade or currentLevel < 0 or currentLevel % 1 ~= 0 or currentLevel >= upgrade.MaxLevel then return nil end
	return math.floor(upgrade.BasePrice * upgrade.PriceGrowth ^ currentLevel)
end
return table.freeze(WeaponConfig)
