import {randomUUID} from 'node:crypto';
import {SerialByKey,roleIds} from './domain.mjs';
export function canModerate(member,config){return member?.id===config.ownerId||roleIds(member).some(id=>config.moderationRoleIds.includes(id));}
export function durationMs(value){
 const text=value.trim().toLowerCase();
 if(['perm','permanente','permaban'].includes(text))return null;
 const match=/^([1-9]\d{0,8})\s*(m|min|minutos?|h|horas?)$/.exec(text);
 if(!match)throw new Error('INVALID_DURATION');
 const n=Number(match[1])*(match[2].startsWith('h')?3600000:60000);
 if(!Number.isSafeInteger(n)||n>365*86400000)throw new Error('INVALID_DURATION');
 return n;
}
async function getBan(guild,id){try{return await guild.bans.fetch(id);}catch(error){if(error.code===10026)return null;throw error;}}
export class ModerationService{
 constructor(config,state,save,clock=()=>Date.now()){
  this.config=config;this.state=state;this.save=save;this.clock=clock;this.locks=new SerialByKey();this.drafts=new Map();state.moderation||={};
 }
 async actor(guild,id){
  if(guild.id!==this.config.guildId)throw new Error('INVALID_SCOPE');
  const actor=await guild.members.fetch({user:id,force:true});
  if(!canModerate(actor,this.config))throw new Error('MODERATOR_ONLY');
  return actor;
 }
 async target(guild,actor,id){
  if([this.config.ownerId,this.config.botId,actor.id].includes(id))throw new Error('PROTECTED_TARGET');
  const target=await guild.members.fetch({user:id,force:true});
  if(target.user.bot)throw new Error('PROTECTED_TARGET');
  const me=await guild.members.fetchMe({force:true});
  if(me.roles.highest.comparePositionTo(target.roles.highest)<=0||
    (actor.id!==this.config.ownerId&&actor.roles.highest.comparePositionTo(target.roles.highest)<=0))throw new Error('ROLE_HIERARCHY');
  if(!target.bannable)throw new Error('ROLE_HIERARCHY');
  return target;
 }
 async prepare(guild,actorId,targetId,duration,reason){
  const actor=await this.actor(guild,actorId),target=await this.target(guild,actor,targetId);
  const ms=durationMs(duration);reason=reason.trim();if(reason.length<3||reason.length>400)throw new Error('INVALID_REASON');
  if(await getBan(guild,targetId))throw new Error('ALREADY_BANNED');
  for(const [id,d]of this.drafts)if(d.validUntil<this.clock())this.drafts.delete(id);
  const draft={id:randomUUID(),actorId,targetId,targetName:target.user.username,durationMs:ms,reason,validUntil:this.clock()+600000};
  this.drafts.set(draft.id,draft);return draft;
 }
 async confirm(guild,actorId,id){
  const draft=this.drafts.get(id);
  if(!draft||draft.actorId!==actorId||draft.validUntil<this.clock())throw new Error('DRAFT_EXPIRED');
  return this.locks.run(draft.targetId,async()=>{
   if(!this.drafts.has(id))throw new Error('DRAFT_EXPIRED');
   const actor=await this.actor(guild,actorId);await this.target(guild,actor,draft.targetId);
   if(await getBan(guild,draft.targetId))throw new Error('ALREADY_BANNED');
   this.drafts.delete(id);
   const now=this.clock();
   const record={...draft,status:'pending',createdAt:new Date(now).toISOString(),expiresAt:draft.durationMs===null?null:now+draft.durationMs,
    auditReason:`GN:${draft.id} | Responsable ${actorId} | ${draft.reason}`};
   this.state.moderation[id]=record;this.save();
   try{await guild.members.ban(draft.targetId,{reason:record.auditReason,deleteMessageSeconds:0});record.status='active';}
   catch(error){
    // A lost HTTP response must never cause a second ban request on restart.
    try{const ban=await getBan(guild,draft.targetId);record.status=ban?.reason===record.auditReason?'active':ban?'superseded':'failed';}catch{}
    this.save();if(record.status!=='active')throw new Error('BAN_UNCERTAIN');
   }
   record.appliedAt=new Date(this.clock()).toISOString();this.save();return record;
  });
 }
 async reconcile(guild){
  if(guild.id!==this.config.guildId)throw new Error('INVALID_SCOPE');
  const failures=[];
  for(const record of Object.values(this.state.moderation)){
   if(record.status!=='pending'&&!(record.status==='active'&&record.expiresAt!==null&&record.expiresAt<=this.clock()))continue;
   try{await this.locks.run(record.targetId,async()=>{
    if(record.status!=='pending'&&record.status!=='active')return;
    const ban=await getBan(guild,record.targetId);
    if(!ban){record.status=record.status==='pending'?'failed':'expired';record.endedAt=new Date(this.clock()).toISOString();this.save();return;}
    if(ban.reason!==record.auditReason){record.status='superseded';this.save();return;}
    if(record.status==='pending'){record.status='active';record.appliedAt=new Date(this.clock()).toISOString();this.save();}
    if(record.expiresAt!==null&&record.expiresAt<=this.clock()){
     await guild.bans.remove(record.targetId,`GN:${record.id} | Fin del ban temporal`);
     record.status='expired';record.endedAt=new Date(this.clock()).toISOString();this.save();
    }
   });}catch(error){failures.push(error);}
  }
  if(failures.length)throw new AggregateError(failures,'MODERATION_RECONCILE_ERRORS');
 }
}
