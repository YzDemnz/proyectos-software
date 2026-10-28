import {ActionRowBuilder,UserSelectMenuBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {isStaff,safeText} from './domain.mjs';
import {currentRank,requirementsFor,parseQualifications} from './promotions.mjs';
export const CAREER_FOOTER='GN • Control de ascensos';
export function promotionsPanel(){return {embeds:[new EmbedBuilder().setColor(0xD4AF37).setTitle('🎖️ Control de ascensos')
 .setDescription('Selecciona al miembro y valida los requisitos de su siguiente grado.').setFooter({text:CAREER_FOOTER})],components:[
 new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('gn:career:select').setPlaceholder('Seleccionar miembro').setMinValues(1).setMaxValues(1)),
 new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gn:career:pending:0').setLabel('Consultar candidatos').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}};}
export function qualificationsModal(id,rank,record={}){
 const modal=new ModalBuilder().setCustomId(`gn:career:form:${id}:${rank.level}`).setTitle('Validar requisitos de ascenso');
 for(const [key,label,type]of requirementsFor(rank.level)){
  const input=new TextInputBuilder().setCustomId(key).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)
   .setPlaceholder(type==='count'?'Número de cursos':'Sí o no');
  if(record.qualifications?.[key]!==undefined)input.setValue(type==='count'?String(record.qualifications[key]):record.qualifications[key]?'Sí':'No');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
 }
 return modal;
}
export class PromotionController{
 constructor(config,state,service){this.config=config;this.state=state;this.service=service;}
 async showMember(i,targetId){
  const member=await i.guild.members.fetch({user:targetId,force:true}),record=this.service.observe(member),rank=currentRank(member,this.config);
  if(!record||!rank||member.user.bot)throw new Error('PROMOTION_NO_RANK');
  const next=this.config.ranks.find(r=>r.level===rank.level+1);
  const fields=requirementsFor(rank.level).map(([key,label,type])=>`${label}: **${record.qualifications[key]===undefined?'Sin validar':type==='count'?record.qualifications[key]:record.qualifications[key]?'Sí':'No'}**`);
  const days=Math.max(0,Math.floor((Date.now()-record.joinedAt)/86400000));
  const embed=new EmbedBuilder().setColor(0xD4AF37).setTitle(`🎖️ ${safeText(member.displayName,100)}`)
   .setDescription(`**Miembro:** <@${member.id}>\n**Grado:** ${rank.name}\n**Antigüedad:** ${days} días${next?`\n**Siguiente grado:** ${next.name}\n\n${fields.join('\n')}`:'\n\nGrado máximo del escalafón.'}`);
  if(record.validatedBy)embed.addFields({name:'Última validación',value:`<@${record.validatedBy}> • <t:${Math.floor(Date.parse(record.validatedAt)/1000)}:f>`});
  await i.editReply({content:'',embeds:[embed],components:next?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gn:career:validate:${member.id}`).setLabel('Validar requisitos').setStyle(ButtonStyle.Primary))]:[],allowedMentions:{parse:[]}});
 }
 async handle(i){
  if(i.channelId!==this.config.promotionPanelChannelId||i.guildId!==this.config.guildId)throw new Error('INVALID_SCOPE');
  const parts=i.customId.split(':');
  if(i.isButton()&&parts[2]==='validate'){
   const actor=await i.guild.members.fetch({user:i.user.id,force:true});if(!isStaff(actor,this.config))throw new Error('STAFF_ONLY');
   const member=await i.guild.members.fetch({user:parts[3],force:true}),rank=currentRank(member,this.config);
   if(!rank||rank.level>=14)throw new Error('PROMOTION_NO_RANK');
   return i.showModal(qualificationsModal(member.id,rank,this.service.observe(member)));
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const actor=await i.guild.members.fetch({user:i.user.id,force:true});if(!isStaff(actor,this.config))throw new Error('STAFF_ONLY');
  if(i.isUserSelectMenu()&&parts[2]==='select')return this.showMember(i,i.values[0]);
  if(i.isModalSubmit()&&parts[2]==='form'){
   const level=Number(parts[4]);if(!Number.isInteger(level)||level<1||level>=14)throw new Error('PROMOTION_RANK_CHANGED');
   await this.service.validate(i.guild,i.user.id,parts[3],level,parseQualifications(level,id=>i.fields.getTextInputValue(id)));
   await i.editReply({content:'Requisitos guardados.',allowedMentions:{parse:[]}});return;
  }
  if(i.isButton()&&parts[2]==='pending'){
   const members=[...i.guild.members.cache.values()].filter(m=>!m.user.bot&&currentRank(m,this.config));
   const records=members.map(member=>({member,record:this.service.observe(member)})).filter(item=>item.record);
   const page=Math.max(0,Math.min(10000,Number(parts[3])||0));
   const lines=records.sort((a,b)=>Number(this.service.eligible(b.record))-Number(this.service.eligible(a.record))||a.record.joinedAt-b.record.joinedAt)
    .slice(page*15,page*15+15).map(({member,record})=>`• <@${member.id}> — ${this.service.eligible(record)?'Listo para aviso':'Pendiente de requisitos o plazo'}`);
   const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gn:career:pending:${Math.max(0,page-1)}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===0),new ButtonBuilder().setCustomId(`gn:career:pending:${page+1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled((page+1)*15>=records.length));
   await i.editReply({embeds:[new EmbedBuilder().setTitle('📋 Candidatos a ascenso').setColor(0xD4AF37).setDescription(lines.join('\n')||'Sin miembros en esta página.').setFooter({text:`Página ${page+1}`})],components:[row],allowedMentions:{parse:[]}});return;
  }
  throw new Error('INVALID_SCOPE');
 }
}
