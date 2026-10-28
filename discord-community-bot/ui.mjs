import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle} from 'discord.js';
import {TYPES,safeText} from './domain.mjs';
export const PANEL_FOOTER='GN • Centro de atención';
export function panelPayload(config={}){
  const embed=new EmbedBuilder().setColor(0x3B4C3C).setTitle('🎫 Mesa de servicio • Atención al personal')
    .setDescription('Selecciona el motivo de tu solicitud.\n\n'+
      '🛡️ **Reportar a un miembro:** explica lo ocurrido e incluye pruebas.\n'+
      '🎯 **Solicitar entrenamiento:** indica el tema y tu disponibilidad.\n'+
      '📈 **Solicitar ascenso:** indica el grado solicitado y tus méritos.')
    .setFooter({text:PANEL_FOOTER});
  if(config.guildIconURL)embed.setThumbnail(config.guildIconURL).setAuthor({name:'[GN] GUARDIA NACIONAL',iconURL:config.guildIconURL});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gn:open:report').setLabel('Reportar a un miembro').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('gn:open:training').setLabel('Solicitar entrenamiento').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gn:open:promotion').setLabel('Solicitar ascenso').setStyle(ButtonStyle.Success));
  return {embeds:[embed],components:[row],allowedMentions:{parse:[]}};
}
export function ticketButtons(closed=false){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gn:claim').setLabel('Tomar ticket').setStyle(ButtonStyle.Primary).setDisabled(closed),
    new ButtonBuilder().setCustomId('gn:close').setLabel(closed?'Ticket cerrado':'Cerrar ticket').setStyle(ButtonStyle.Secondary).setDisabled(closed));
}
export function ticketModal(type){
  if(!TYPES[type])throw new Error('Invalid ticket type');
  const modal=new ModalBuilder().setCustomId(`gn:submit:${type}`).setTitle(TYPES[type].label);
  const add=(id,label,style,required,max,placeholder)=>{
    const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if(placeholder)input.setPlaceholder(placeholder);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  };
  if(type==='report'){
    add('subject','Miembro reportado: ID, @mención o nombre',TextInputStyle.Short,true,100,'ID, @usuario o nombre exacto del miembro');
    add('details','¿Qué ocurrió? Describe el reporte',TextInputStyle.Paragraph,true,3500);
    add('evidence','Enlaces de pruebas (opcional)',TextInputStyle.Paragraph,false,1000);
  }else if(type==='training'){
    add('subject','¿Qué entrenamiento solicitas?',TextInputStyle.Short,true,150);
    add('availability','Días, horario y zona horaria disponibles',TextInputStyle.Short,true,300);
    add('details','Información adicional (opcional)',TextInputStyle.Paragraph,false,3000);
  }else{
    add('subject','Grado al que solicitas ascender',TextInputStyle.Short,true,100);
    add('details','Méritos y motivo de la solicitud',TextInputStyle.Paragraph,true,3500);
    add('evidence','Pruebas o referencias (opcional)',TextInputStyle.Paragraph,false,1000);
  }
  return modal;
}
export function openingPayload(ticket,details){
  const embed=new EmbedBuilder().setTitle(`${TYPES[ticket.type].label} • #${String(ticket.sequence).padStart(4,'0')}`)
    .setColor(TYPES[ticket.type].color).setTimestamp().setFooter({text:'GN • Expediente reservado'})
    .setDescription(safeText(details.details||'Solicitud de entrenamiento.',3500))
    .addFields({name:'Solicitante',value:`<@${ticket.ownerId}>`},
      {name:ticket.type==='report'?'Miembro reportado':ticket.type==='promotion'?'Grado solicitado':'Entrenamiento',value:details.targetId?`<@${details.targetId}>`:safeText(details.subject,1024)});
  if(details.availability)embed.addFields({name:'Disponibilidad',value:safeText(details.availability,1024)});
  if(details.evidence)embed.addFields({name:'Pruebas o referencias',value:safeText(details.evidence,1000)});
  return {content:`<@${ticket.ownerId}>, tu ticket está abierto. Puedes adjuntar información aquí.`,embeds:[embed],components:[ticketButtons()],allowedMentions:{parse:[],users:[ticket.ownerId]}};
}
export function ranksPayload(config){
  const groups=['Tropa','Oficiales','Jefes','Generales'];
  const embed=new EmbedBuilder().setTitle('🎖️ Escalafón — Guardia Nacional').setColor(0xD4AF37)
    .setDescription('Rango de ingreso: **Soldado (Raso)**.\nSolicitudes de ascenso: <#'+config.ticketPanelChannelId+'>.')
    .setFooter({text:'GN • Escalafón oficial'});
  for(const group of groups)embed.addFields({name:group,value:config.ranks.filter(r=>r.group===group).map(r=>`${r.level}. <@&${r.id}>`).join('\n')});
  if(config.guildIconURL)embed.setThumbnail(config.guildIconURL).setAuthor({name:'CUARTEL GENERAL • PERSONAL Y RANGOS',iconURL:config.guildIconURL});
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
export function welcomeGuidePayload(config){
  const embed=new EmbedBuilder().setColor(0x3B4C3C).setTitle('🪖 Puesto de incorporación')
    .setDescription('**Bienvenido a [GN] Guardia Nacional.**\nDisciplina, respeto y trabajo en equipo.\n\n'+
      `**01 • ALTA DE PERSONAL**\nRango de ingreso: <@&${config.starterRoleId}>.\n\n`+
      `**02 • CONOCE TU UNIDAD**\nConsulta el escalafón en <#${config.ranksChannelId}> y reúnete con la unidad en <#${config.generalChannelId}>.\n\n`+
      `**03 • MESA DE SERVICIO**\nReportes, entrenamientos y solicitudes de ascenso en <#${config.ticketPanelChannelId}>.`)
    .setFooter({text:'GN • Puesto de incorporación'});
  if(config.guildIconURL)embed.setThumbnail(config.guildIconURL);
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
export function farewellGuidePayload(config){
  const embed=new EmbedBuilder().setColor(0x596052).setTitle('📋 Registro de salidas')
    .setDescription('Registro de salidas del personal de **[GN] Guardia Nacional**.')
    .setFooter({text:'GN • Registro de salidas'});
  if(config.guildIconURL)embed.setThumbnail(config.guildIconURL);
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
export function memberWelcomePayload(member,config){
  const embed=new EmbedBuilder().setColor(0x70834A).setTitle('🟢 Alta de personal • Bienvenido a la unidad')
    .setDescription(`<@${member.id}> se incorpora a **[GN] Guardia Nacional**.\n\n`+
      `**Rango de ingreso:** <@&${config.starterRoleId}>\n**Escalafón:** <#${config.ranksChannelId}>\n**Solicitudes y reportes:** <#${config.ticketPanelChannelId}>\n\nDisciplina, respeto y trabajo en equipo.`)
    .setTimestamp().setFooter({text:'GN • Incorporaciones'});
  if(config.guildIconURL)embed.setThumbnail(config.guildIconURL);
  return {content:`¡Bienvenido/a, <@${member.id}>!`,embeds:[embed],allowedMentions:{parse:[],users:[member.id]}};
}
export function memberFarewellPayload(member,config){
  const embed=new EmbedBuilder().setColor(0x7F423D).setTitle('🔴 Salida registrada')
    .setDescription(`**${safeText(member.user?.globalName||member.user?.username||'Un miembro',100)}** salió de **[GN] Guardia Nacional**.\n\nGracias por formar parte de la unidad.`)
    .setTimestamp().setFooter({text:'GN • Registro de salidas'});
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
