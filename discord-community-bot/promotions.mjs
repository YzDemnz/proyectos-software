import {createHash,randomUUID} from 'node:crypto';
import {EmbedBuilder} from 'discord.js';
import {isStaff,roleIds,SerialByKey} from './domain.mjs';
const DAY=86400000;
export const REMINDER_AGE=21*DAY;
export function currentRank(member,config){const ids=roleIds(member);return config.ranks.filter(r=>ids.includes(r.id)).sort((a,b)=>b.level-a.level)[0]||null;}
export const REQUIREMENTS={
 1:[['basic','Instrucción básica aprobada','yes']],
 2:[['basicCourses','Cursos básicos aprobados','count']],
 3:[['battleMerits','Méritos destacados en batalla','yes'],['leadership','Amplia capacidad de liderazgo','yes']],
 4:[['brigade','Capaz de liderar una brigada','yes']],
 5:[['flash','Capaz de dirigir operaciones flash','yes']],
 6:[['courses','Cursos aprobados en total','count'],['activity','Actividad constante','yes'],['battleMerits','Méritos en el campo de batalla','yes'],['missionMerits','Méritos en misiones','yes'],['novices','Contribuyó a entrenar novatos','yes']],
 7:[['teaching','Cursos que puede impartir como profesor','count']],
};
export function requirementsFor(level){return REQUIREMENTS[level]||(level<14?[['commandReview','Alto mando autoriza revisar el ascenso','yes']]:[]);}
export function parseQualifications(level,field){
 const result={};for(const [id,,type]of requirementsFor(level)){
  const value=field(id).trim().toLocaleLowerCase('es');
  if(type==='count'){if(!/^\d{1,3}$/.test(value))throw new Error('INVALID_QUALIFICATIONS');result[id]=Number(value);}
  else{if(!['si','sí','no'].includes(value))throw new Error('INVALID_QUALIFICATIONS');result[id]=value!=='no';}
 }return result;
}
export function monthAfter(timestamp){
 const date=new Date(timestamp),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.getTime();
}
export function meetsRequirements(level,q,joinedAt,now){
 switch(level){
 case 1:return q.basic===true;
 case 2:return now-joinedAt>14*DAY&&q.basicCourses>=2;
 case 3:return q.battleMerits===true&&q.leadership===true;
 case 4:return now>=monthAfter(joinedAt)&&q.brigade===true;
 case 5:return q.flash===true;
 case 6:return now>=monthAfter(joinedAt)+14*DAY&&q.courses>=5&&['activity','battleMerits','missionMerits','novices'].every(k=>q[k]===true);
 case 7:return q.teaching>=3;
 default:return level<14&&q.commandReview===true;
 }
}
export class PromotionService{
 constructor(config,state,save,log=()=>{},clock=()=>Date.now()){
  this.config=config;this.state=state;this.save=save;this.log=log;this.clock=clock;this.locks=new SerialByKey();
  state.promotions||={members:{},reminders:{}};
 }
 observe(member){
  if(member.guild.id!==this.config.guildId||member.user.bot||!member.joinedTimestamp)return null;
  const rank=currentRank(member,this.config);if(!rank)return null;
  let record=this.state.promotions.members[member.id];const now=this.clock();
  if(!record||record.joinedAt!==member.joinedTimestamp){
   record={memberId:member.id,joinedAt:member.joinedTimestamp,rankId:rank.id,rankLevel:rank.level,rankHeldSince:rank.level===1?member.joinedTimestamp:now,generation:0,qualifications:{}};
   this.state.promotions.members[member.id]=record;this.save();
  }else if(record.rankId!==rank.id){
   if(rank.level>record.rankLevel)record.lastPromotionAt=now;
   record.rankId=rank.id;record.rankLevel=rank.level;record.rankHeldSince=now;record.generation++;record.qualifications={};this.save();
  }
  return record;
 }
 eligible(record){return record&&record.rankLevel<14&&this.clock()-record.joinedAt>REMINDER_AGE&&this.clock()-record.rankHeldSince>REMINDER_AGE&&meetsRequirements(record.rankLevel,record.qualifications,record.joinedAt,this.clock());}
 async validate(guild,actorId,targetId,expectedRank,values){
  if(guild.id!==this.config.guildId)throw new Error('INVALID_SCOPE');
  return this.locks.run(targetId,async()=>{
   const actor=await guild.members.fetch({user:actorId,force:true});if(!isStaff(actor,this.config))throw new Error('STAFF_ONLY');
   const member=await guild.members.fetch({user:targetId,force:true}),rank=currentRank(member,this.config);
   if(!rank||rank.level!==expectedRank||member.user.bot)throw new Error('PROMOTION_RANK_CHANGED');
   const actorRank=currentRank(actor,this.config);
   if(actorId!==this.config.ownerId&&(!actorRank||actorRank.level<=rank.level||actorId===targetId))throw new Error('PROMOTION_HIERARCHY');
   const record=this.observe(member);record.qualifications=values;record.validatedAt=new Date(this.clock()).toISOString();record.validatedBy=actorId;
   record.validationHistory||=[];record.validationHistory.push({at:record.validatedAt,by:actorId,rankId:rank.id,generation:record.generation,values:{...values}});
   this.save();return {member,rank,record};
  });
 }
 async sendOnce(user,record,kind,embed){
  const key=`${kind}MessageId`;if(record[key])return;
  const channel=await user.createDM();const footer='GN • Carrera militar',title=embed.toJSON().title;
  const recent=await channel.messages.fetch({limit:50});
  let message=recent.find(m=>m.author.id===this.config.botId&&m.embeds.some(e=>e.footer?.text===footer&&e.timestamp===record.createdAt&&e.title===title));
  if(!message){
   embed.setFooter({text:footer}).setTimestamp(new Date(record.createdAt));const nonce=createHash('sha256').update(`${record.id}:${kind}`).digest('hex').slice(0,24);
   message=await channel.send({embeds:[embed],nonce,enforceNonce:true,allowedMentions:{parse:[]}});
  }
  record[key]=message.id;this.save();
 }
 async notify(member,record,guild){
  const now=this.clock(),key=`${member.id}:${record.joinedAt}:${record.generation}:${record.rankId}`;
  let reminder=this.state.promotions.reminders[key];
  if(!reminder){reminder={id:randomUUID(),memberId:member.id,rankId:record.rankId,generation:record.generation,createdAt:new Date(now).toISOString(),nextAttemptAt:0};this.state.promotions.reminders[key]=reminder;this.save();}
  if(reminder.ownerMessageId||now<reminder.nextAttemptAt)return;
  const rank=this.config.ranks.find(r=>r.id===record.rankId),next=this.config.ranks.find(r=>r.level===rank.level+1);
  const days=Math.floor((now-record.joinedAt)/DAY),heldDays=Math.floor((now-record.rankHeldSince)/DAY);
  if(!reminder.memberMessageId){
   try{
    await this.sendOnce(member.user,reminder,'miembro',new EmbedBuilder().setColor(0xD4AF37).setTitle('🎖️ Tu próximo ascenso')
     .setDescription(`Llevas **${days} días** en Guardia Nacional. Tienes los requisitos validados para solicitar el grado de **${next.name}**.\n\nSolicita tu ascenso en <#${this.config.ticketPanelChannelId}> e incluye tus pruebas.`));
   }catch(error){
    reminder.nextAttemptAt=now+DAY;reminder.lastError=typeof error.code==='number'?error.code:null;this.save();
    if(error.code===50007){
     const owner=await guild.members.fetch(this.config.ownerId);
     await this.sendOnce(owner.user,reminder,'fallo',new EmbedBuilder().setColor(0x963F36).setTitle('📋 Ascenso pendiente')
      .setDescription(`<@${member.id}> lleva **${days} días** en el servidor y tiene validados los requisitos para **${next.name}**. No pude enviarle el mensaje privado.`));
    }
    this.log('promotion-member-dm-failed',{code:reminder.lastError});return;
   }
  }
  const owner=await guild.members.fetch(this.config.ownerId);
  try{await this.sendOnce(owner.user,reminder,'owner',new EmbedBuilder().setColor(0xD4AF37).setTitle('📋 Recordatorio de ascenso')
   .setDescription(`<@${member.id}> lleva **${days} días** en el servidor y **${heldDays} días** en el grado de **${rank.name}**. Tiene validados los requisitos para solicitar **${next.name}**.\n\nYa le envié el mensaje automático para invitarle a solicitar su ascenso.`));}
  catch(error){reminder.nextAttemptAt=now+DAY;this.save();this.log('promotion-owner-dm-failed',{code:typeof error.code==='number'?error.code:null});}
 }
 async scan(guild){
  if(guild.id!==this.config.guildId)throw new Error('INVALID_SCOPE');
  const members=guild.members.cache||await guild.members.fetch();
  for(const member of members.values()){
   if(member.id===this.config.ownerId)continue;
   try{await this.locks.run(member.id,async()=>{const record=this.observe(member);if(this.eligible(record))await this.notify(member,record,guild);});}
   catch(error){this.log('promotion-scan-error',{code:typeof error.code==='number'?error.code:null});}
  }
 }
}
