import {ActionRowBuilder,UserSelectMenuBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {safeText} from './domain.mjs';
export const MOD_FOOTER='GN • Control de baneos';
export function moderationPanel(config){
 const embed=new EmbedBuilder().setTitle('🛑 Control de baneos • Jefes y Generales').setColor(0x963F36)
  .setDescription(`Selecciona un miembro e indica el motivo y la duración.\n\n**Duración:** minutos (\`30m\`), horas (\`2h\`) o permanente (\`perm\`).\nRevisa la sanción antes de confirmarla.\n\nEl motivo y la duración se publicarán en <#${config.sanctionsChannelId}>.`).setFooter({text:MOD_FOOTER});
 if(config.guildIconURL)embed.setThumbnail(config.guildIconURL);
 return {embeds:[embed],components:[
  new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('gn:mod:select').setPlaceholder('Buscar y seleccionar un miembro').setMinValues(1).setMaxValues(1)),
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gn:mod:members:0').setLabel('Ver miembros').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('gn:mod:history:0').setLabel('Consultar baneos').setStyle(ButtonStyle.Secondary))
 ],allowedMentions:{parse:[]}};
}
export function banModal(id){return new ModalBuilder().setCustomId(`gn:mod:form:${id}`).setTitle('Preparar ban de un miembro').addComponents(
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duración: 30m, 2h o perm').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('Minutos, horas o permanente')),
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo (se publicará en sanciones)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(400)));
}
export function durationLabel(record){return record.durationMs===null?'Permanente':record.durationMs%3600000===0?`${record.durationMs/3600000} hora(s)`:`${record.durationMs/60000} minuto(s)`;}
const pager=(kind,page,more)=>new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId(`gn:mod:${kind}:${Math.max(0,page-1)}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
 new ButtonBuilder().setCustomId(`gn:mod:${kind}:${page+1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(!more));
export class ModerationController{
 constructor(config,state,service,save){this.config=config;this.state=state;this.service=service;this.save=save;}
 async handle(i){
  const parts=i.customId?.split(':');if(parts?.[1]!=='mod')return false;
  if(i.channelId!==this.config.moderationPanelChannelId)throw new Error('INVALID_SCOPE');
  if(i.isUserSelectMenu()&&parts[2]==='select'){
   await this.service.actor(i.guild,i.user.id);await i.showModal(banModal(i.values[0]));return true;
  }
  if(i.isModalSubmit()&&parts[2]==='form'){
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const draft=await this.service.prepare(i.guild,i.user.id,parts[3],i.fields.getTextInputValue('duration'),i.fields.getTextInputValue('reason'));
   const embed=new EmbedBuilder().setColor(0xC0392B).setTitle('Confirmar sanción')
    .setDescription(`**Miembro:** ${safeText(draft.targetName,100)} (<@${draft.targetId}>)\n**ID:** ${draft.targetId}\n**Duración:** ${durationLabel(draft)}\n**Motivo:** ${safeText(draft.reason,800)}\n\nSe publicará en <#${this.config.sanctionsChannelId}>.`);
   await i.editReply({embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gn:mod:confirm:${draft.id}`).setLabel('Confirmar ban').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`gn:mod:cancel:${draft.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}});return true;
  }
  if(i.isButton()&&parts[2]==='confirm'){
   await i.deferUpdate();const record=await this.service.confirm(i.guild,i.user.id,parts[3]);
   await i.editReply({content:`Ban aplicado a <@${record.targetId}>. Duración: **${durationLabel(record)}**.`,embeds:[],components:[],allowedMentions:{parse:[]}});return true;
  }
  if(i.isButton()&&parts[2]==='cancel'){
   await this.service.actor(i.guild,i.user.id);const draft=this.service.drafts.get(parts[3]);
   if(!draft||draft.actorId!==i.user.id)throw new Error('DRAFT_EXPIRED');
   this.service.drafts.delete(parts[3]);await i.update({content:'Sanción cancelada. No se aplicó ningún ban.',embeds:[],components:[]});return true;
  }
  if(i.isButton()&&['members','history'].includes(parts[2])){
   await i.deferReply({flags:MessageFlags.Ephemeral});await this.service.actor(i.guild,i.user.id);
   const page=Math.max(0,Math.min(10000,Number(parts[3])||0));let lines,total;
   if(parts[2]==='members'){
    const members=[...i.guild.members.cache.values()].filter(m=>!m.user.bot).sort((a,b)=>a.displayName.localeCompare(b.displayName,'es'));
    total=members.length;lines=members.slice(page*15,page*15+15).map(m=>`• ${safeText(m.displayName,75)} — <@${m.id}>\n  ID: ${m.id}`);
   }else{
    const records=Object.values(this.state.moderation).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));total=records.length;
    const labels={active:'Activo',pending:'Pendiente de comprobar',expired:'Finalizado',failed:'No aplicado',superseded:'Sustituido por otro ban'};
    lines=records.slice(page*15,page*15+15).map(r=>`• <@${r.targetId}> — **${durationLabel(r)}**, ${labels[r.status]||r.status}${r.expiresAt?`\n  Vencimiento: <t:${Math.floor(r.expiresAt/1000)}:f>`:''}`);
   }
   const embed=new EmbedBuilder().setTitle(parts[2]==='members'?'👥 Personal del servidor':'📋 Historial de baneos del panel').setColor(0x3B4C3C).setDescription(lines.join('\n\n')||'Sin registros en esta página.').setFooter({text:`Página ${page+1} • Total: ${total}`});
   await i.editReply({embeds:[embed],components:[pager(parts[2],page,(page+1)*15<total)],allowedMentions:{parse:[]}});return true;
  }
  throw new Error('INVALID_SCOPE');
 }
 async syncLogs(guild){
  for(const r of Object.values(this.state.moderation)){
   const phases=r.appliedAt||['active','expired'].includes(r.status)?['applied',...(r.status==='expired'?['ended']:[])]:[];
   for(const phase of phases)for(const [visibility,channelId]of [['private',this.config.bansChannelId],['public',this.config.sanctionsChannelId]]){
   const key=`${visibility}${phase}MessageId`;if(r[key])continue;
   const channel=await guild.channels.fetch(channelId);
   const embed=new EmbedBuilder().setColor(phase==='applied'?0x963F36:0x70834A).setTitle(phase==='applied'?'⛔ Ban aplicado':'✅ Ban finalizado o retirado')
    .setDescription(`**Miembro:** <@${r.targetId}> (${r.targetId})${visibility==='private'?`\n**Responsable:** <@${r.actorId}>`:''}\n**Duración:** ${durationLabel(r)}\n**Motivo:** ${safeText(r.reason,800)}\n**Inicio:** <t:${Math.floor(Date.parse(r.createdAt)/1000)}:f>${r.expiresAt?`\n**Vencimiento previsto:** <t:${Math.floor(r.expiresAt/1000)}:f>`:''}`)
    .setFooter({text:`GN • Ban ${r.id} • ${phase}`}).setTimestamp();
   // Recover a sent message after a process crash before local persistence.
   const recent=await channel.messages.fetch({limit:100});
   let msg=recent.find(m=>m.author.id===this.config.botId&&m.embeds.some(e=>e.footer?.text===`GN • Ban ${r.id} • ${phase}`));
   if(!msg)msg=await channel.send({embeds:[embed],nonce:`${visibility==='private'?'r':'u'}${phase[0]}${r.id.replaceAll('-','').slice(0,22)}`,enforceNonce:true,allowedMentions:{parse:[]}});
   r[key]=msg.id;this.save();
   }
  }
 }
}
