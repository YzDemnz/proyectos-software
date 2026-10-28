--!strict
-- Presentation only. Damage, ammo, prices and all authoritative stats stay in WeaponConfig.
-- Offsets are in normalized viewmodel studs, facing -Z. Source IDs are provenance only.
export type VisualDefinition = {
	SourceAssetId: number?,
	TargetLength: number,
	RotationDegrees: { number }?,
	HipOffset: { number }?,
	ADSRearDistance: number?,
	Grip: { number }?,
	SupportGrip: { number }?,
	Muzzle: { number }?,
	Magazine: { number }?,
	ADSSight: { number }?,
	AttachmentNames: { [string]: string }?,
}
local weapons: { [string]: VisualDefinition } = {
	Rifle = { TargetLength = 3.05, ADSRearDistance = 0.76 },
	SMG = { TargetLength = 2.35, ADSRearDistance = 0.7 },
	DMR = { TargetLength = 3.65, ADSRearDistance = 0.82 },
}
return table.freeze({
	TemplateFolder = "WeaponVisuals",
	MaxPartCount = 160,
	MaxDescendantCount = 800,
	MinSourceLength = 0.05,
	MaxScaleFactor = 100,
	Weapons = weapons,
})
