import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Client,GatewayIntentBits,Partials,Events,MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType} from 'discord.js';
import {TicketService,TYPES,canClose,shouldAssignStarter,safeText,SerialByKey} from './domain.mjs';
import {panelPayload,ticketModal,openingPayload,ticketButtons,ranksPayload,PANEL_FOOTER,welcomeGuidePayload,farewellGuidePayload,memberWelcomePayload,memberFarewellPayload} from './ui.mjs';
import {atomicWrite,loadState,logger} from './storage.mjs';
import {channelGuides} from './policies.mjs';
import {ModerationService} from './moderation.mjs';
import {ModerationController,moderationPanel,MOD_FOOTER} from './moderation-ui.mjs';
import {ArchiveService} from './archives.mjs';
import {PromotionService} from './promotions.mjs';
import {PromotionController,promotionsPanel,CAREER_FOOTER} from './promotions-ui.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
if(!/^\d{16,21}$/.test(config.guildId)||!/^\d{16,21}$/.test(config.botId))throw new Error('Configure guildId and botId');
const log=logger(root);
const stateFile=path.join(root,'state.json');
const state=loadState(stateFile);
state.systemMessages||={};state.departures||={};
const save=()=>atomicWrite(stateFile,state);
const tickets=new TicketService(config,state,save,log);
const archives=new ArchiveService(config,state,save,log,()=>Date.now(),tickets.locks);
const promotions=new PromotionService(config,state,save,log);
const promotionUI=new PromotionController(config,state,promotions);
const moderation=new ModerationService(config,state,save);
const moderationUI=new ModerationController(config,state,moderation,save);
const joins=new SerialByKey();
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers],partials:[Partials.GuildMember,Partials.User],allowedMentions:{parse:[]}});
let heartbeat,reconcileTimer,moderationTimer,archiveTimer,promotionTimer,stopping=false,initializing=false,initialized=false;
const promotionCycle=new SerialByKey();
async function processPromotions(guild){return promotionCycle.run('cycle',()=>promotions.scan(guild));}
const archiveCycle=new SerialByKey();
async function processArchives(guild){return archiveCycle.run('cycle',()=>archives.reconcile(guild));}
const moderationCycle=new SerialByKey();
async function processModeration(guild){return moderationCycle.run('cycle',async()=>{let failure;try{await moderation.reconcile(guild);}catch(error){failure=error;}await moderationUI.syncLogs(guild);if(failure)throw failure;});}
function health(extra={}){atomicWrite(path.join(root,'health.json'),{updatedAt:new Date().toISOString(),pid:process.pid,guildId:config.guildId,botId:config.botId,ready:client.isReady()&&initialized,features:{autorole:true,welcome:true,farewell:true,privateTickets:true,moderationPanel:!!config.moderationPanelChannelId,temporaryBans:true,ticketArchiveRetentionHours:72,promotionReminders:!!config.promotionPanelChannelId},...extra});}
function errorLog(event,error){log(event,{errorName:String(error?.name||'Error').slice(0,60),code:typeof error?.code==='number'||typeof error?.code==='string'?String(error.code).slice(0,60):null});}
function token(){
 let value=process.env.DISCORD_TOKEN;
 if(!value)value=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::Out.Write([Environment]::GetEnvironmentVariable('DISCORD_TOKEN','User'))"],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
 if(!value)throw new Error('DISCORD_TOKEN is missing');
 return value.replace(/^Bot\s+/,'');
}

async function ensureSystemMessage(channelId,key,payload,footer){
 const channel=await client.channels.fetch(channelId);
 if(!channel?.isTextBased()||channel.guildId!==config.guildId)throw new Error('System channel unavailable');
 let message=null;
 if(state.systemMessages[key]){
   try{message=await channel.messages.fetch(state.systemMessages[key]);}
   catch(error){if(error.code!==10008)throw error;}
 }
 if(!message){
   const recent=await channel.messages.fetch({limit:50});
   message=recent.find(m=>m.author.id===config.botId&&m.embeds.some(e=>e.footer?.text===footer));
 }
 if(message)await message.edit(payload);else message=await channel.send(payload);
 state.systemMessages[key]=message.id;save();return message;
}
async function welcome(member){
 if(member.guild.id!==config.guildId||member.user.bot)return;
 return joins.run(member.id,async()=>{
   if(shouldAssignStarter(member,config))await member.roles.add(config.starterRoleId,'Rango automático de ingreso solicitado por el propietario');
   const joinedAt=member.joinedTimestamp||Date.now();
   let record=state.joins[member.id];
   if(!record||record.joinedAt!==joinedAt){record={joinedAt,welcomeSent:false};state.joins[member.id]=record;save();}
   if(!record.welcomeSent){
     const channel=await client.channels.fetch(config.welcomeChannelId);
     await channel.send({...memberWelcomePayload(member,config),nonce:`w${member.id.slice(-12)}:${joinedAt.toString(36)}`,enforceNonce:true});
     record.welcomeSent=true;save();
   }
 });
}
async function farewell(member){
 if(member.guild.id!==config.guildId||member.user?.bot)return;
 const key=`${member.id}:${state.joins[member.id]?.joinedAt||member.joinedTimestamp||'unknown'}`;
 if(state.departures[key])return;
 const channel=await client.channels.fetch(config.farewellChannelId);
 await channel.send({...memberFarewellPayload(member,config),nonce:`f${member.id.slice(-12)}:${Number(state.joins[member.id]?.joinedAt||member.joinedTimestamp||0).toString(36)}`,enforceNonce:true});
 state.departures[key]=new Date().toISOString();save();
}
async function reconcile(guild){
 const members=await guild.members.fetch();
 let count=0;
 for(const member of members.values())if(member.joinedTimestamp>=Date.parse(config.activatedAt)&&!member.user.bot){
   try{await welcome(member);count++;}catch(error){errorLog('member-reconcile-error',error);}
 }
 log('member-reconcile-complete',{checked:count});
}
async function restoreTickets(guild){
 const channels=await guild.channels.fetch();
 for(const channel of channels.values()){
   const parent=channels.get(channel?.parentId);
   const isArchive=parent?.type===ChannelType.GuildCategory&&/^📁 ┃ ARCHIVO DE EXPEDIENTES(?: \d+)?$/.test(parent.name);
   if(!channel||(channel.parentId!==config.ticketCategoryId&&!isArchive)||channel.type!==ChannelType.GuildText)continue;
   const match=/^GN ticket \| (report|training|promotion) \| (\d{17,20}) \| (open|closed) \| (\d+)(?: \| (\d{4}-\d{2}-\d{2}T[\d:.]+Z))?$/.exec(channel.topic||'');
   if(!match)continue;
   const sequence=Number(match[4]);
   state.sequence=Math.max(state.sequence,sequence);
   state.tickets[channel.id]||={channelId:channel.id,type:match[1],ownerId:match[2],status:match[3],sequence,createdAt:new Date(channel.createdTimestamp).toISOString(),assignedTo:null};
   if(match[3]==='closed'){
    const ticket=state.tickets[channel.id];
    if(['open','closing'].includes(ticket.status))ticket.status='closed';
    ticket.closedAt||=match[5]||new Date().toISOString();
   }
 }
 save();
 for(const ticket of Object.values(state.tickets))if(ticket.status==='closing'){
   const channel=await guild.channels.fetch(ticket.channelId).catch(()=>null);
   if(channel)await tickets.close(channel,{id:config.ownerId,roles:[]});
 }
}
async function resolveReportedMember(guild,input){
 const text=input.trim();
 const direct=/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(text);
 if(direct)return guild.members.fetch(direct[1]||direct[2]).catch(()=>null);
 const query=text.replace(/^@/,'');
 if(query.length<2)return null;
 const found=await guild.members.search({query,limit:10});
 const matches=found.filter(m=>[m.user.username,m.user.globalName,m.nickname,m.displayName].filter(Boolean).some(n=>n.toLocaleLowerCase('es')===query.toLocaleLowerCase('es')));
 return matches.size===1?matches.first():null;
}
const errors={STAFF_ONLY:'Solo Capitanes o rangos superiores pueden tomar tickets.',ALREADY_CLAIMED:'Otro responsable ya está atendiendo este ticket.',NOT_AUTHORIZED:'No tienes permiso para cerrar este ticket.',TICKET_NOT_OPEN:'Este ticket ya está cerrado o no está registrado.',TICKET_CATEGORY_FULL:'La categoría de tickets está llena. Contacta con un Capitán para liberar o archivar espacio.'};
async function privateReply(interaction,content){
 if(interaction.deferred||interaction.replied)return interaction.editReply({content,embeds:[],components:[],allowedMentions:{parse:[]}});
 return interaction.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
}
async function handleInteraction(interaction){
 if(interaction.guildId!==config.guildId||interaction.user.bot)return;
 if(!interaction.customId?.startsWith('gn:'))return;
 try{
   const parts=interaction.customId.split(':');
   if(parts[1]==='career'){await promotionUI.handle(interaction);if(parts[2]==='form')await processPromotions(interaction.guild).catch(e=>errorLog('promotion-cycle-error',e));return;}
   if(parts[1]==='mod'){await moderationUI.handle(interaction);if(parts[2]==='confirm')await processModeration(interaction.guild).catch(e=>errorLog('moderation-cycle-error',e));return;}
   if(interaction.isButton()&&parts[1]==='open'){
     if(!TYPES[parts[2]])return privateReply(interaction,'Tipo de solicitud desconocido.');
     return interaction.showModal(ticketModal(parts[2]));
   }
   if(interaction.isModalSubmit()&&parts[1]==='submit'){
     const type=parts[2];if(!TYPES[type])return privateReply(interaction,'Tipo de solicitud desconocido.');
     await interaction.deferReply({flags:MessageFlags.Ephemeral});
     const field=id=>{try{return interaction.fields.getTextInputValue(id).trim();}catch{return '';}};
     const details={subject:field('subject'),details:field('details'),evidence:field('evidence'),availability:field('availability')};
     if(type==='report'){
       const target=await resolveReportedMember(interaction.guild,details.subject);
       if(!target||target.user.bot)return privateReply(interaction,'No encontré a ese miembro. Vuelve a abrir el formulario y usa su ID, @mención o nombre exacto en este servidor.');
       details.targetId=target.id;
     }
     const result=await tickets.open(interaction.guild,interaction.user.id,type,details);
     if(!result.ticket.openingMessageId){
       const message=await result.channel.send({...openingPayload(result.ticket,details),nonce:result.channel.id,enforceNonce:true});
       result.ticket.openingMessageId=message.id;save();
     }
     return privateReply(interaction,`${result.existing?'Ya tienes un ticket abierto para este motivo':'Tu ticket privado está listo'}: <#${result.channel.id}>.`);
   }
   if(interaction.isButton()&&parts[1]==='claim'){
     await interaction.deferReply({flags:MessageFlags.Ephemeral});
     const member=await interaction.guild.members.fetch(interaction.user.id);
     const ticket=await tickets.claim(interaction.channel,member);
     await interaction.channel.send({content:`🫡 Ticket tomado por <@${member.id}>.`,allowedMentions:{parse:[]}});
     return privateReply(interaction,`Estás atendiendo el ticket #${String(ticket.sequence).padStart(4,'0')}.`);
   }
   if(interaction.isButton()&&parts[1]==='close'){
     const ticket=state.tickets[interaction.channelId];
     const member=await interaction.guild.members.fetch(interaction.user.id);
     if(!ticket||!canClose(member,ticket,config))throw new Error('NOT_AUTHORIZED');
     if(!['open','closing'].includes(ticket.status))throw new Error('TICKET_NOT_OPEN');
     const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gn:confirm-close:${interaction.channelId}:${interaction.user.id}`).setLabel('Confirmar cierre').setStyle(ButtonStyle.Danger));
     return interaction.reply({content:'¿Cerrar y archivar este ticket?',components:[row],flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
   }
   if(interaction.isButton()&&parts[1]==='confirm-close'){
     if(parts[2]!==interaction.channelId||parts[3]!==interaction.user.id)throw new Error('NOT_AUTHORIZED');
     await interaction.deferReply({flags:MessageFlags.Ephemeral});
     const member=await interaction.guild.members.fetch(interaction.user.id);
     const ticket=await tickets.close(interaction.channel,member);
     if(ticket.openingMessageId){
       const message=await interaction.channel.messages.fetch(ticket.openingMessageId).catch(()=>null);
       if(message)await message.edit({components:[ticketButtons(true)]});
     }
     await interaction.channel.send({content:'🔒 Ticket cerrado y archivado.',allowedMentions:{parse:[]}});
     return privateReply(interaction,'Ticket cerrado y archivado.');
   }
   return privateReply(interaction,'Acción no disponible.');
 }catch(error){
   errorLog('interaction-error',error);
   const moderationErrors={MODERATOR_ONLY:'Solo Jefes (Mayor, Teniente Coronel, Coronel) y Generales, además del propietario, pueden usar el panel.',INVALID_DURATION:'Usa minutos (30m), horas (2h) o perm. Los temporales admiten entre 1 minuto y 365 días.',INVALID_REASON:'Indica un motivo de entre 3 y 400 caracteres.',PROTECTED_TARGET:'No puedes banearte a ti mismo, al propietario ni a un bot desde este panel.',ROLE_HIERARCHY:'Solo puedes banear a miembros con rango inferior al tuyo y al rol del bot.',ALREADY_BANNED:'Este miembro ya está baneado. No se modificó el ban existente.',DRAFT_EXPIRED:'Esta confirmación ya se utilizó, caducó o pertenece a otro mando. Prepara una nueva sanción.',BAN_UNCERTAIN:'No se pudo confirmar el resultado del ban. Consulta el historial antes de repetirlo; el bot comprobará la operación pendiente.',INVALID_SCOPE:'Acción fuera del panel o servidor autorizado.'};
   const promotionErrors={PROMOTION_NO_RANK:'Selecciona un miembro con un grado que pueda ascender.',PROMOTION_RANK_CHANGED:'El grado del miembro cambió. Vuelve a seleccionarlo.',PROMOTION_HIERARCHY:'Solo puedes validar requisitos de miembros de rango inferior al tuyo.',INVALID_QUALIFICATIONS:'Escribe Sí o No en las validaciones y un número entero en los cursos.'};
   await privateReply(interaction,promotionErrors[error.message]||moderationErrors[error.message]||errors[error.message]||'No pude completar la acción. Inténtalo de nuevo; si persiste, contacta con un Capitán.').catch(()=>{});
 }
}
client.on(Events.InteractionCreate,handleInteraction);
client.on(Events.GuildMemberAdd,member=>welcome(member).catch(e=>errorLog('member-join-error',e)));
client.on(Events.GuildMemberUpdate,(before,after)=>{try{promotions.observe(after);}catch(e){errorLog('promotion-observe-error',e);}if(before.pending&&!after.pending)welcome(after).catch(e=>errorLog('member-screening-error',e));});
client.on(Events.GuildMemberRemove,member=>farewell(member).catch(e=>errorLog('member-leave-error',e)));
client.on(Events.Error,error=>errorLog('client-error',error));
client.on(Events.ShardError,error=>errorLog('gateway-error',error));
client.on(Events.ShardDisconnect,()=>{log('gateway-disconnected');health();});
client.once(Events.ClientReady,async()=>{
 if(initializing)return;initializing=true;
 try{
   if(client.user.id!==config.botId)throw new Error('Unexpected bot identity');
   const guild=await client.guilds.fetch(config.guildId);
   const me=await guild.members.fetchMe();await guild.roles.fetch();
   for(const id of config.rankRoleIds){const role=guild.roles.cache.get(id);if(!role||me.roles.highest.comparePositionTo(role)<=0)throw new Error('Bot role must be above all military ranks');}
   await restoreTickets(guild);
   await processArchives(guild);
   archiveTimer=setInterval(()=>processArchives(guild).catch(e=>errorLog('archive-cycle-error',e)),60000);
   await ensureSystemMessage(config.ticketPanelChannelId,'ticketPanel',panelPayload(config),PANEL_FOOTER);
   await ensureSystemMessage(config.ranksChannelId,'ranks',ranksPayload(config),'GN • Escalafón oficial');
   await ensureSystemMessage(config.welcomeChannelId,'welcomeGuide',welcomeGuidePayload(config),'GN • Puesto de incorporación');
   await ensureSystemMessage(config.farewellChannelId,'farewellGuide',farewellGuidePayload(config),'GN • Registro de salidas');
   if(config.moderationPanelChannelId){
    for(const [key,id,payload,footer]of channelGuides(config))await ensureSystemMessage(id,key,payload,footer);
    await ensureSystemMessage(config.moderationPanelChannelId,'moderationPanel',moderationPanel(config),MOD_FOOTER);
    await processModeration(guild);
    moderationTimer=setInterval(()=>processModeration(guild).catch(e=>errorLog('moderation-cycle-error',e)),30000);
   }
   await reconcile(guild);
   if(config.promotionPanelChannelId){
    await ensureSystemMessage(config.promotionPanelChannelId,'promotionControl',promotionsPanel(),CAREER_FOOTER);
    const coursesPayload={embeds:[{title:'📚 Cursos aprobados',description:'Formatos y pruebas de los cursos aprobados por el personal.',color:0x3B4C3C,footer:{text:'GN • Registro de cursos'}}],allowedMentions:{parse:[]}};
    await ensureSystemMessage(config.coursesChannelId,'coursesGuide',coursesPayload,'GN • Registro de cursos');
    await processPromotions(guild);
    promotionTimer=setInterval(()=>processPromotions(guild).catch(e=>errorLog('promotion-cycle-error',e)),900000);
   }
   initialized=true;health();log('bot-ready',{ranks:config.rankRoleIds.length,staffRanks:config.staffRoleIds.length});
   heartbeat=setInterval(()=>health(),30000);
   reconcileTimer=setInterval(()=>reconcile(guild).catch(e=>errorLog('reconcile-error',e)),300000);
 }catch(error){errorLog('initialization-error',error);await shutdown(1);}
});
async function shutdown(code=0){
 if(stopping)return;stopping=true;clearInterval(heartbeat);clearInterval(reconcileTimer);clearInterval(moderationTimer);clearInterval(archiveTimer);clearInterval(promotionTimer);
 initialized=false;health({stopped:true});client.destroy();lock.close();process.exit(code);
}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
process.on('unhandledRejection',error=>{errorLog('unhandled-error',error);shutdown(1);});
process.on('uncaughtException',error=>{errorLog('fatal-error',error);shutdown(1);});
// A per-user named pipe prevents two Gateway workers from processing the same event.
const lock=net.createServer();
lock.on('error',()=>{log('duplicate-worker-prevented');process.exit(0);});
lock.listen('\\\\.\\pipe\\codex-gn-900074637307453016-worker',()=>{
 health({starting:true});client.login(token()).catch(error=>{errorLog('login-error',error);shutdown(1);});
});
