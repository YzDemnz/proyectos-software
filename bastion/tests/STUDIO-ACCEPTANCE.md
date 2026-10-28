# Engine acceptance matrix — pending

CLI compilation and pure-policy tests do **not** execute the Roblox engine. Record the Studio version, player count, result, and server/client errors for each case when Studio is available.

| Case | Actions | Expected result |
|---|---|---|
| First spawn | Play the built place | First-person camera, rifle model, full health/ammunition, money, and intermission HUD appear without errors. |
| Movement | Walk, sprint, crouch, jump, aim; repeat while changing direction | Smooth camera, correct speed/stance, no firing during sprint, no accumulating camera or input connections. |
| Fire/reload | Empty rifle; reload partly filled magazines with low reserve | Server consumes one round per accepted shot. Reload conserves ammunition. Empty/reloading weapons cannot damage enemies. |
| Damage | Hit the same zombie in head, torso, and limb | Server applies configured zone multipliers; killed zombies reward once and stop attacking. |
| Geometry | Fire into walls, floors, and through doorways | Hitscan stops at solid geometry. Muzzle/camera obstruction does not allow shooting through walls. |
| AI | Lead enemies through corridors, around corners, and between courtyard/interior routes | Navigation remains active, attacks respect distance/cooldown/line of sight, stalled enemies recover, waves finish. |
| Arsenal | Open nearby; buy/equip weapons, ammo, and each upgrade to maximum | Money, ownership, stats, ammunition, and caps match the server state. Insufficient funds leave state unchanged. |
| Arsenal invalid location | Open Arsenal, then walk away or die before submitting | Every subsequent purchase/equip/upgrade is denied outside server-validated range or while dead. |
| Two players | Start one server with at least two clients; fire and use Arsenal simultaneously | Independent money/inventory, replicated firing effects, shared waves, no lost updates or rewards for another player. |
| Player death | Kill one player while another survives; finish the wave | Survivor continues. Dead player cannot act and respawns during the next intermission. |
| Defeat/rejoin | Kill all players; then leave/rejoin during intermission and active rounds | Defeat resets the run once. No old zombies/reloads persist. Empty servers wait; returning players can restart play. |
| Remote validation | From a development client, submit NaN/Inf vectors, invalid IDs/actions, repeated shot IDs, rapid remote bursts, and unowned weapons | Server returns/rejects safely, limits work, awards no money, and changes no unauthorized state. |
| Load | Reach configured maximum active enemies with several clients | Active count remains capped; paths are throttled; no rising per-zombie connections after deaths/rounds. |
| Presentation | Test fullscreen/windowed, respawn, reload, ADS, and Arsenal UI | HUD remains readable; controls recover after closing menus/death; placeholder audio availability is checked. |

Current status: **not run; Roblox Studio is required.**
