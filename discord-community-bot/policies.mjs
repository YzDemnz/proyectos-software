import {EmbedBuilder} from 'discord.js';
const payload=(title,description,footer,config,color=0x3B4C3C)=>{
 const embed=new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setFooter({text:footer});
 if(config.guildIconURL)embed.setThumbnail(config.guildIconURL);
 return {embeds:[embed],allowedMentions:{parse:[]}};
};
export function rulesPayload(config){return payload('📜 Reglamento de la corporación',
 '**01 • UNIFORME REGLAMENTARIO**\nEstá prohibido modificar el uniforme de la corporación.\n\n'+
 '**02 • RESPETO A LA VIDA**\nDebes valorar y respetar la vida de tu personaje y la de los demás durante el rol.\n\n'+
 '**03 • ASISTENCIA A DETENIDOS**\nSe debe intentar siempre proporcionar atención sanitaria a los detenidos que la necesiten.\n\n'+
 '**04 • FUEGO AMIGO**\nEstá prohibido el team kill intencional: matar deliberadamente a un compañero.\n\n'+
 '**05 • CADENA DE MANDO**\nEstá prohibido desobedecer órdenes directas de los superiores durante el servicio.\n\n'+
 '**VALORACIÓN INDIVIDUAL**\nCada infracción será valorada por separado por los mandos, atendiendo a los hechos, las pruebas y las circunstancias del caso.\n\n'+
 `Los reportes se presentan mediante un ticket en <#${config.ticketPanelChannelId}>.`, 'GN • Reglamento oficial',config);}
export function promotionsPayload(config){return payload('📈 Normas de ascenso • Carrera militar',
 '**Soldado (Raso) → Cabo**\nAprobar la instrucción básica.\n\n'+
 '**Cabo → Sargento Segundo**\nTener más de 2 semanas de antigüedad en el servidor y haber aprobado satisfactoriamente al menos 2 cursos básicos.\n\n'+
 '**Sargento Segundo → Sargento Primero**\nTener méritos destacados en el campo de batalla y haber demostrado una amplia capacidad de liderazgo.\n\n'+
 '**Sargento Primero → Subteniente**\nTener al menos 1 mes en el servidor y ser capaz de liderar una brigada por cuenta propia.\n\n'+
 '**Subteniente → Teniente**\nSer capaz de dirigir operaciones flash.\n\n'+
 '**Teniente → Capitán Segundo**\nTener como mínimo 1 mes y 2 semanas en el servidor, al menos 5 cursos, actividad constante, méritos en el campo de batalla y en misiones, y haber contribuido al entrenamiento de novatos.\n\n'+
 '**Capitán Segundo → Capitán Primero**\nSer capaz de impartir como profesor al menos 3 cursos.\n\n'+
 '**Mayor, Teniente Coronel, Coronel y Generales**\nLos ascensos quedan a consideración de los altos mandos. No hay requisitos específicos.\n\n'+
 `**SOLICITUD DE ASCENSO**\nAbre un ticket en <#${config.ticketPanelChannelId}> e incluye tus méritos y las pruebas de los requisitos.`, 'GN • Normas de ascenso',config,0xD4AF37);}
export function channelGuides(config){return [
 ['rules',config.rulesChannelId,rulesPayload(config),'GN • Reglamento oficial'],
 ['promotions',config.promotionsChannelId,promotionsPayload(config),'GN • Normas de ascenso'],
 ['announcements',config.announcementsChannelId,payload('📢 Órdenes y comunicados','Órdenes de servicio, convocatorias y comunicados oficiales de la corporación.','GN • Comunicados oficiales',config),'GN • Comunicados oficiales'],
 ['bansGuide',config.bansChannelId,payload('⛔ Registro reservado de baneos','Registro de baneos de la corporación.','GN • Registro de baneos',config),'GN • Registro de baneos'],
 ['sanctionsGuide',config.sanctionsChannelId,payload('⚖️ Registro de sanciones','Resoluciones disciplinarias de la corporación.\n\nCada infracción será valorada por separado.','GN • Disciplina',config),'GN • Disciplina'],
 ['staffGuide',config.staffChatChannelId,payload('🛡️ Sala de mandos','Asuntos internos, coordinación y deliberaciones de la corporación.','GN • Asuntos internos',config),'GN • Asuntos internos'],
 ['toxicGuide',config.toxicChatChannelId,payload('☣️ Chat tóxico','Bromas y pique entre compañeros. Respeta el reglamento de la corporación.','GN • Zona de convivencia',config),'GN • Zona de convivencia'],
 ];}
