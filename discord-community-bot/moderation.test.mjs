import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection} from 'discord.js';
import {ModerationService,durationMs,canModerate} from './moderation.mjs';
import {moderationPanel,banModal,ModerationController} from './moderation-ui.mjs';
import {rulesPayload,promotionsPayload} from './policies.mjs';
const config={guildId:'900074637307453016',botId:'900048003608092974',ownerId:'900093714330985990',moderationRoleIds:['major'],moderationPanelChannelId:'panel',ticketPanelChannelId:'tickets'};
function fixture(){
 let now=1000000000,creates=0,removes=0,lastOptions;
 const rank=position=>({position,comparePositionTo:r=>position-r.position});
 const member=(id,position,roles=[],bot=false)=>({id,user:{bot,username:id},bannable:true,roles:{highest:rank(position),cache:new Collection(roles.map(id=>[id,{}]))}});
 const members=new Map([['target',member('target',1)],['major',member('major',9,['major'])],['captain',member('captain',7,['captain'])],[config.ownerId,member(config.ownerId,0)],['peer',member('peer',9,['major'])],[config.botId,member(config.botId,15,[],true)]]);
 const bans=new Map();const guild={id:config.guildId,members:{fetch:async input=>members.get(typeof input==='string'?input:input.user),fetchMe:async()=>members.get(config.botId),ban:async(id,options)=>{creates++;lastOptions=options;bans.set(id,{reason:options.reason});}},bans:{fetch:async id=>{if(!bans.has(id))throw Object.assign(new Error('Unknown Ban'),{code:10026});return bans.get(id);},remove:async id=>{removes++;bans.delete(id);}}};
 const state={};const service=new ModerationService(config,state,()=>{},()=>now);
 return {guild,members,bans,state,service,tick:n=>now+=n,get creates(){return creates;},get removes(){return removes;},get options(){return lastOptions;}};
}
test('durations accept minutes, hours and permanent, rejecting zero and malformed values',()=>{
 assert.equal(durationMs('30m'),1800000);assert.equal(durationMs('2 horas'),7200000);assert.equal(durationMs('perm'),null);
 for(const v of ['0m','-2h','2d','1.5h','999999999h','permanente123'])assert.throws(()=>durationMs(v),/INVALID_DURATION/);
});
test('only chiefs, generals and owner can moderate; captain is denied before any ban',async()=>{
 const f=fixture();assert.equal(canModerate(f.members.get('major'),config),true);assert.equal(canModerate(f.members.get('captain'),config),false);
 await assert.rejects(()=>f.service.prepare(f.guild,'captain','target','1m','test'),/MODERATOR_ONLY/);assert.equal(f.creates,0);
});
test('preparing or cancelling never bans; confirming once preserves messages',async()=>{
 const f=fixture();const d=await f.service.prepare(f.guild,'major','target','2h','Prueba simulada');assert.equal(f.creates,0);
 const records=await Promise.allSettled([f.service.confirm(f.guild,'major',d.id),f.service.confirm(f.guild,'major',d.id)]);
 assert.equal(records.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.creates,1);assert.equal(f.options.deleteMessageSeconds,0);
 assert.equal(f.state.moderation[d.id].status,'active');
});
test('same or higher roles, owner, bot and self are protected',async()=>{
 const f=fixture();for(const target of ['peer','major',config.ownerId,config.botId])await assert.rejects(()=>f.service.prepare(f.guild,'major',target,'1m','test'),/ROLE_HIERARCHY|PROTECTED_TARGET/);
 assert.equal(f.creates,0);
});
test('authorization is refreshed at confirmation and expires after ten minutes',async()=>{
 const f=fixture();const d=await f.service.prepare(f.guild,'major','target','1m','test');f.members.get('major').roles.cache.clear();
 await assert.rejects(()=>f.service.confirm(f.guild,'major',d.id),/MODERATOR_ONLY/);assert.equal(f.creates,0);
 f.tick(600001);await assert.rejects(()=>f.service.confirm(f.guild,'major',d.id),/DRAFT_EXPIRED/);
});
test('temporary bans persist across restart and expire; permanent bans remain',async()=>{
 const f=fixture();const d=await f.service.prepare(f.guild,'major','target','1m','test');await f.service.confirm(f.guild,'major',d.id);
 f.tick(60001);const recovered=new ModerationService(config,JSON.parse(JSON.stringify(f.state)),()=>{},()=>1000060001);await recovered.reconcile(f.guild);assert.equal(f.removes,1);
 const next=await f.service.prepare(f.guild,'major','target','perm','test');await f.service.confirm(f.guild,'major',next.id);
 f.tick(999999999999);await f.service.reconcile(f.guild);assert.equal(f.bans.has('target'),true);
});
test('expiry never lifts a later external ban for the same user',async()=>{
 const f=fixture();const d=await f.service.prepare(f.guild,'major','target','1m','test');await f.service.confirm(f.guild,'major',d.id);
 f.bans.set('target',{reason:'Nueva sanción manual'});f.tick(60001);await f.service.reconcile(f.guild);assert.equal(f.removes,0);assert.equal(f.state.moderation[d.id].status,'superseded');
});
test('an existing ban cannot be replaced or shortened',async()=>{
 const f=fixture();f.bans.set('target',{reason:'Preexistente'});await assert.rejects(()=>f.service.prepare(f.guild,'major','target','1m','test'),/ALREADY_BANNED/);assert.equal(f.creates,0);
});
test('lost HTTP ban response recovers without sending another ban request',async()=>{
 const f=fixture();const original=f.guild.members.ban;f.guild.members.ban=async(...args)=>{await original(...args);throw new Error('Lost response');};
 const d=await f.service.prepare(f.guild,'major','target','1m','test');const r=await f.service.confirm(f.guild,'major',d.id);assert.equal(r.status,'active');assert.equal(f.creates,1);
});
test('pending recovery never re-bans a missing user and rejects a different guild',async()=>{
 const f=fixture();f.state.moderation.x={targetId:'target',status:'pending',auditReason:'ours',expiresAt:1};await f.service.reconcile(f.guild);assert.equal(f.state.moderation.x.status,'failed');assert.equal(f.creates,0);
 await assert.rejects(()=>f.service.reconcile({...f.guild,id:'other'}),/INVALID_SCOPE/);
});
test('moderation controls serialize to Discord limits and policies contain requested rules',()=>{
 const p=moderationPanel(config);assert.equal(p.components[0].toJSON().components[0].type,5);assert.equal(banModal('123').toJSON().components.length,2);
 const rules=rulesPayload(config).embeds[0].toJSON();assert.match(rules.description,/valorada por separado/);assert.match(rules.description,/sanitaria/);assert.match(rules.description,/team kill/);
 const promotions=promotionsPayload(config).embeds[0].toJSON();assert.match(promotions.description,/más de 2 semanas/);assert.match(promotions.description,/1 mes y 2 semanas/);assert.match(promotions.description,/al menos 3 cursos/);assert.ok(promotions.description.length<4096);
});
test('panel interaction outside authorized channel cannot trigger any moderation action',async()=>{
 const f=fixture();const controller=new ModerationController(config,f.state,f.service,()=>{});
 await assert.rejects(()=>controller.handle({customId:'gn:mod:confirm:x',channelId:'other'}),/INVALID_SCOPE/);assert.equal(f.creates,0);
});
test('public sanctions mirror the exact reason, duration and expiry without duplicate messages',async()=>{
 const f=fixture();const d=await f.service.prepare(f.guild,'major','target','2h','Team kill intencional');await f.service.confirm(f.guild,'major',d.id);
 const channels=new Map(),sent=[];
 for(const id of ['bans','sanctions'])channels.set(id,{messages:{fetch:async()=>new Collection()},send:async payload=>{sent.push({id,payload});return {id:`msg-${sent.length}`};}});
 f.guild.channels={fetch:async id=>channels.get(id)};
 const controller=new ModerationController({...config,bansChannelId:'bans',sanctionsChannelId:'sanctions'},f.state,f.service,()=>{});
 await controller.syncLogs(f.guild);await controller.syncLogs(f.guild);assert.equal(sent.length,2);
 const publicPost=sent.find(m=>m.id==='sanctions');assert.match(publicPost.payload.embeds[0].toJSON().description,/Team kill intencional/);assert.match(publicPost.payload.embeds[0].toJSON().description,/2 hora/);assert.match(publicPost.payload.embeds[0].toJSON().description,/Vencimiento previsto/);
 assert.notEqual(sent[0].payload.nonce,sent[1].payload.nonce);assert.deepEqual(publicPost.payload.allowedMentions.parse,[]);
 f.tick(7200001);await f.service.reconcile(f.guild);await controller.syncLogs(f.guild);assert.equal(sent.length,4);assert.match(sent.at(-1).payload.embeds[0].toJSON().title,/finalizado/);
});
test('an inaccessible expired ban does not prevent another due ban from being lifted',async()=>{
 const f=fixture();f.state.moderation.blocked={targetId:'blocked',status:'active',auditReason:'blocked',expiresAt:1};
 f.state.moderation.due={targetId:'target',status:'active',auditReason:'due',expiresAt:1};f.bans.set('target',{reason:'due'});
 const fetch=f.guild.bans.fetch;f.guild.bans.fetch=async id=>{if(id==='blocked')throw new Error('Temporary outage');return fetch(id);};
 await assert.rejects(()=>f.service.reconcile(f.guild),/MODERATION_RECONCILE_ERRORS/);assert.equal(f.removes,1);assert.equal(f.state.moderation.due.status,'expired');
});
