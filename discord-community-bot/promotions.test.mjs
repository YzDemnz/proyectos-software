import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection} from 'discord.js';
import {PromotionService,REMINDER_AGE,meetsRequirements,monthAfter,parseQualifications} from './promotions.mjs';
import {qualificationsModal,promotionsPanel} from './promotions-ui.mjs';
const DAY=86400000;
const config={guildId:'guild',botId:'bot',ownerId:'owner',staffRoleIds:['r7','r9','r14'],ticketPanelChannelId:'tickets',ranks:Array.from({length:14},(_,i)=>({id:`r${i+1}`,level:i+1,name:`Grado ${i+1}`}))};
function fixture(){
 let now=Date.parse('2026-10-20T12:00:00.000Z');const sent=[];
 function user(id){const messages=new Collection();return {id,bot:false,createDM:async()=>({messages:{fetch:async()=>messages},send:async payload=>{const message={id:`m${sent.length}`,author:{id:'bot'},embeds:payload.embeds.map(e=>e.toJSON())};sent.push({userId:id,payload});messages.set(message.id,message);return message;}})};}
 const makeMember=(id,level)=>({id,displayName:id,guild:{id:config.guildId},user:user(id),joinedTimestamp:now-30*DAY,roles:{cache:new Collection([[`r${level}`,{}]])}});
 const members=new Collection([['candidate',makeMember('candidate',1)],['owner',makeMember('owner',14)],['captain',makeMember('captain',7)],['major',makeMember('major',9)]]);
 const guild={id:config.guildId,members:{fetch:async arg=>arg===undefined?members:members.get(typeof arg==='string'?arg:arg.user)}};
 const state={};const service=new PromotionService(config,state,()=>{},()=>{},()=>now);
 return {service,state,guild,members,sent,tick:ms=>now+=ms,get now(){return now;}};
}
test('eligibility requires over three weeks and validated criteria, never age alone',async()=>{
 const f=fixture();let r=f.service.observe(f.members.get('candidate'));assert.equal(f.service.eligible(r),false);r.qualifications={basic:true};assert.equal(f.service.eligible(r),true);
 r.joinedAt=f.now-REMINDER_AGE;r.rankHeldSince=r.joinedAt;assert.equal(f.service.eligible(r),false);f.tick(1);assert.equal(f.service.eligible(r),true);
});
test('all user-defined promotion requirements are checked independently',()=>{
 const joined=Date.parse('2026-01-01T00:00:00Z'),now=Date.parse('2026-03-01T00:00:00Z');
 assert.equal(meetsRequirements(2,{basicCourses:2},joined,now),true);assert.equal(meetsRequirements(2,{basicCourses:1},joined,now),false);
 assert.equal(meetsRequirements(3,{battleMerits:true,leadership:false},joined,now),false);
 assert.equal(meetsRequirements(4,{brigade:true},joined,joined+29*DAY),false);assert.equal(meetsRequirements(5,{flash:true},joined,now),true);
 const q={courses:5,activity:true,battleMerits:true,missionMerits:true,novices:true};assert.equal(meetsRequirements(6,q,joined,now),true);
 for(const key of Object.keys(q))assert.equal(meetsRequirements(6,{...q,[key]:key==='courses'?4:false},joined,now),false);
 assert.equal(meetsRequirements(7,{teaching:3},joined,now),true);assert.equal(meetsRequirements(8,{},joined,now),false);assert.equal(meetsRequirements(8,{commandReview:true},joined,now),true);assert.equal(meetsRequirements(14,{commandReview:true},joined,now),false);
 assert.equal(new Date(monthAfter(Date.parse('2026-01-31T10:00:00Z'))).toISOString(),'2026-02-28T10:00:00.000Z');
});
test('a qualified member and owner receive exactly one DM each across scans and restart',async()=>{
 const f=fixture();const r=f.service.observe(f.members.get('candidate'));r.qualifications={basic:true};
 await f.service.scan(f.guild);await f.service.scan(f.guild);assert.equal(f.sent.length,2);assert.deepEqual(f.sent.map(m=>m.userId),['candidate','owner']);
 assert.match(f.sent[1].payload.embeds[0].toJSON().description,/Ya le envié/);
 const restored=new PromotionService(config,JSON.parse(JSON.stringify(f.state)),()=>{},()=>{},()=>f.now);await restored.scan(f.guild);assert.equal(f.sent.length,2);
});
test('blocked DMs produce an honest owner notice, without falsely claiming delivery or daily spam',async()=>{
 const f=fixture();f.service.observe(f.members.get('candidate')).qualifications={basic:true};
 f.members.get('candidate').user.createDM=async()=>{throw Object.assign(new Error('Blocked'),{code:50007});};
 await f.service.scan(f.guild);await f.service.scan(f.guild);assert.equal(f.sent.length,1);assert.equal(f.sent[0].userId,'owner');
 assert.match(f.sent[0].payload.embeds[0].toJSON().description,/No pude enviarle/);assert.doesNotMatch(f.sent[0].payload.embeds[0].toJSON().description,/Ya le envié/);
 f.tick(DAY);await f.service.scan(f.guild);assert.equal(f.sent.length,1);
});
test('promoting a member resets rank tenure, invalidates previous qualifications and prevents immediate reminders',()=>{
 const f=fixture(),m=f.members.get('candidate');const r=f.service.observe(m);r.qualifications={basic:true};
 m.roles.cache=new Collection([['r2',{}]]);const updated=f.service.observe(m);assert.equal(updated.rankLevel,2);assert.deepEqual(updated.qualifications,{});assert.equal(updated.rankHeldSince,f.now);assert.equal(f.service.eligible(updated),false);
});
test('existing higher ranks without known promotion history wait for an observed tenure',()=>{
 const f=fixture(),m=f.members.get('candidate');m.roles.cache=new Collection([['r2',{}]]);const r=f.service.observe(m);r.qualifications={basicCourses:2};
 assert.equal(f.service.eligible(r),false);f.tick(REMINDER_AGE+1);assert.equal(f.service.eligible(r),true);
});
test('only higher staff or owner can validate and the validation history is retained',async()=>{
 const f=fixture();await f.service.validate(f.guild,'captain','candidate',1,{basic:true});assert.equal(f.state.promotions.members.candidate.validatedBy,'captain');
 await assert.rejects(()=>f.service.validate(f.guild,'captain','major',9,{commandReview:true}),/PROMOTION_HIERARCHY/);
 await assert.rejects(()=>f.service.validate(f.guild,'candidate','candidate',1,{basic:true}),/STAFF_ONLY/);
 await f.service.validate(f.guild,'owner','candidate',1,{basic:false});assert.equal(f.state.promotions.members.candidate.validationHistory.length,2);
 await assert.rejects(()=>f.service.validate(f.guild,'owner','candidate',2,{}),/PROMOTION_RANK_CHANGED/);
});
test('promotion forms use at most five inputs and reject invalid attestation values',()=>{
 assert.equal(promotionsPanel().components[0].toJSON().components[0].type,5);
 for(let level=1;level<14;level++)assert.ok(qualificationsModal('candidate',{level}).toJSON().components.length<=5);
 assert.deepEqual(parseQualifications(1,()=> 'Sí'),{basic:true});assert.throws(()=>parseQualifications(1,()=> 'quizás'),/INVALID_QUALIFICATIONS/);assert.throws(()=>parseQualifications(2,()=> '-1'),/INVALID_QUALIFICATIONS/);
});
test('promotion scans reuse the member cache without a second Gateway member request',async()=>{
 const f=fixture();f.service.observe(f.members.get('candidate')).qualifications={basic:true};f.guild.members.cache=f.members;
 const fetch=f.guild.members.fetch;f.guild.members.fetch=async arg=>{if(arg===undefined)throw new Error('Duplicate Gateway request');return fetch(arg);};
 await f.service.scan(f.guild);assert.equal(f.sent.length,2);
});
