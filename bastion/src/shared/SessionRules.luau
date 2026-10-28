--!strict
-- Pure policy functions; exercised by the standalone Luau suite.
export type TokenBucket = { tokens: number, time: number }
export type FireRecord = {
	alive: boolean, reloading: boolean, sprinting: boolean,
	equipped: string, inventory: { [string]: { magazine: number } },
	nextFireAt: number, equipReadyAt: number?,
}
export type RewardConfig = { DamageMoneyPerHP: number, KillReward: number, HeadshotBonus: number }
export type WaveConfig = { MaxWaveCount: number, BaseCount: number, CountPerRound: number, CountPerExtraPlayer: number }
local Rules = {}
function Rules.IsFinite(value: any): boolean
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end
function Rules.IsInteger(value: any, minimum: number, maximum: number): boolean
	return Rules.IsFinite(value) and value % 1 == 0 and value >= minimum and value <= maximum
end
function Rules.TakeToken(bucket: TokenBucket, now: number, rate: number, capacity: number): boolean
	bucket.tokens = math.min(capacity, bucket.tokens + math.max(0, now - bucket.time) * rate)
	bucket.time = now
	if bucket.tokens < 1 then return false end
	bucket.tokens -= 1
	return true
end
function Rules.CanFire(record: FireRecord, now: number, _stats: any, tolerance: number): boolean
	local weapon = record.inventory[record.equipped]
	return record.alive and not record.reloading and not record.sprinting
		and weapon ~= nil and weapon.magazine > 0 and now + tolerance >= record.nextFireAt
		and now >= (record.equipReadyAt or 0)
end
function Rules.ReloadTransfer(magazine: number, reserve: number, capacity: number): (number, number)
	local amount = math.max(0, math.min(capacity - magazine, reserve))
	return magazine + amount, reserve - amount
end
function Rules.Reward(actualDamage: number, killed: boolean, headshot: boolean, economy: RewardConfig, carry: number): (number, number)
	local exact = math.max(0, actualDamage) * economy.DamageMoneyPerHP + carry
	local whole = math.floor(exact)
	local reward = whole + (if killed then economy.KillReward else 0)
		+ (if killed and headshot then economy.HeadshotBonus else 0)
	return reward, exact - whole
end
function Rules.WaveCount(round: number, players: number, config: WaveConfig): number
	return math.min(config.MaxWaveCount, config.BaseCount + (round - 1) * config.CountPerRound
		+ math.max(0, players - 1) * config.CountPerExtraPlayer)
end
return table.freeze(Rules)
