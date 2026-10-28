--!nonstrict
local Rules = require(game:GetService("ReplicatedStorage").Bastion.Shared.SessionRules)
local EconomyService = {}
EconomyService.__index = EconomyService
function EconomyService.new(ctx)
	return setmetatable({ ctx = ctx }, EconomyService)
end
function EconomyService:Award(player, amount)
	local record = self.ctx.PlayerData:Get(player)
	if not record or not Rules.IsFinite(amount) or amount < 0 then return false end
	record.money = math.min(self.ctx.Config.Economy.MaxMoney, record.money + math.floor(amount))
	self.ctx.PlayerData:Push(player)
	return true
end
function EconomyService:Spend(player, amount)
	local record = self.ctx.PlayerData:Get(player)
	if not record or not Rules.IsInteger(amount, 0, self.ctx.Config.Economy.MaxMoney) or record.money < amount then return false end
	record.money -= amount
	-- The caller pushes after the entire non-yielding transaction is committed.
	return true
end
function EconomyService:RewardDamage(player, actualDamage, killed, headshot)
	local record = self.ctx.PlayerData:Get(player)
	if not record or not Rules.IsFinite(actualDamage) or actualDamage <= 0 then return end
	local reward, carry = Rules.Reward(actualDamage, killed, headshot, self.ctx.Config.Economy, record.damageCarry)
	record.damageCarry = carry
	record.kills += if killed then 1 else 0
	record.headshots += if killed and headshot then 1 else 0
	self:Award(player, reward)
end
return EconomyService
