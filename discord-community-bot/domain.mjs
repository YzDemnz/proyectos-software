import {PermissionFlagsBits as P, ChannelType, escapeMarkdown} from 'discord.js';

export const TYPES = Object.freeze({
  report: {label:'Reportar a un miembro', slug:'reporte', color:0xC0392B},
  training: {label:'Solicitar entrenamiento', slug:'entrenamiento', color:0x2980B9},
  promotion: {label:'Solicitar ascenso', slug:'ascenso', color:0xD4AF37},
});
export const VIEW = P.ViewChannel;
export const WRITE = P.SendMessages;
export const MEMBER_ACCESS = P.ViewChannel|P.SendMessages|P.ReadMessageHistory|P.AttachFiles|P.EmbedLinks|P.AddReactions;
const NO_THREADS = P.CreatePublicThreads|P.CreatePrivateThreads|P.CreateInstantInvite;
export const ARCHIVE_RETENTION_MS=72*60*60*1000;
export const ARCHIVE_CATEGORY_PREFIX='📁 ┃ ARCHIVO DE EXPEDIENTES';
export function isArchiveCategory(channel){return channel?.type===ChannelType.GuildCategory&&/^📁 ┃ ARCHIVO DE EXPEDIENTES(?: \d+)?$/.test(channel.name);}
const NO_MANAGEMENT=P.ManageChannels|P.ManageRoles|P.ManageMessages|P.ManageThreads|P.ManageWebhooks;
const ARCHIVE_READ=P.ViewChannel|P.ReadMessageHistory;
const ARCHIVE_DENY=NO_THREADS|NO_MANAGEMENT|P.SendMessages|P.SendMessagesInThreads|P.AddReactions;
export function archiveOverwrites(config,ownerId){return [
 {id:config.guildId,type:0,deny:(P.ViewChannel|ARCHIVE_DENY).toString(),allow:'0'},
 {id:config.botId,type:1,allow:(MEMBER_ACCESS|NO_MANAGEMENT).toString(),deny:'0'},
 ...config.staffRoleIds.map(id=>({id,type:0,allow:ARCHIVE_READ.toString(),deny:ARCHIVE_DENY.toString()})),
 ...(ownerId?[{id:ownerId,type:1,allow:'0',deny:(P.ViewChannel|ARCHIVE_DENY).toString()}]:[]),
 ];}

export function ticketOverwrites(config, ownerId) {
  return [
    {id:config.guildId,type:0,deny:(P.ViewChannel|NO_THREADS|NO_MANAGEMENT).toString(),allow:'0'},
    {id:config.botId,type:1,allow:(MEMBER_ACCESS|P.ManageChannels|P.ManageMessages).toString(),deny:'0'},
    ...config.staffRoleIds.map(id=>({id,type:0,allow:MEMBER_ACCESS.toString(),deny:(NO_THREADS|NO_MANAGEMENT).toString()})),
    ...(ownerId ? [{id:ownerId,type:1,allow:MEMBER_ACCESS.toString(),deny:(NO_THREADS|NO_MANAGEMENT).toString()}] : []),
  ];
}
export function roleIds(member) {
  if(Array.isArray(member.roles)) return member.roles;
  return [...(member.roles?.cache?.keys()||[])];
}
export function isStaff(member,config) {
  return member?.id===config.ownerId || roleIds(member).some(id=>config.staffRoleIds.includes(id));
}
export function canClose(member,ticket,config) {
  return !!member && (member.id===ticket.ownerId || isStaff(member,config));
}
export function shouldAssignStarter(member,config) {
  return member.guild.id===config.guildId && !member.user.bot && !member.pending &&
    !roleIds(member).some(id=>config.rankRoleIds.includes(id));
}
export function safeText(value,max=1024) {
  return escapeMarkdown(String(value||'Sin especificar').slice(0,max)).slice(0,max);
}

export class SerialByKey {
  queues=new Map();
  async run(key,fn) {
    const previous=this.queues.get(key)||Promise.resolve();
    let release;
    const lock=new Promise(resolve=>{release=resolve;});
    const next=previous.catch(()=>{}).then(()=>lock);
    this.queues.set(key,next);
    await previous.catch(()=>{});
    try {return await fn();}
    finally {release();if(this.queues.get(key)===next)this.queues.delete(key);}
  }
}

export class TicketService {
  constructor(config,state,save,log=()=>{},clock=()=>Date.now()) {
    this.config=config;this.state=state;this.save=save;this.log=log;this.clock=clock;this.locks=new SerialByKey();
  }
  async open(guild,ownerId,type,details) {
    if(guild.id!==this.config.guildId || !TYPES[type])throw new Error('INVALID_SCOPE');
    return this.locks.run(`open:${ownerId}:${type}`,async()=>{
      const existing=Object.values(this.state.tickets).find(t=>t.ownerId===ownerId&&t.type===type&&['open','closing'].includes(t.status));
      if(existing) {
        const channel=await guild.channels.fetch(existing.channelId).catch(()=>null);
        if(channel)return {ticket:existing,channel,existing:true};
        existing.status='deleted';this.save();
      }
      // Recover a channel if Discord created it but its response was lost.
      const currentChannels=await guild.channels.fetch();
      const prefix=`GN ticket | ${type} | ${ownerId} | open | `;
      const orphan=[...currentChannels.values()].find(c=>c?.parentId===this.config.ticketCategoryId&&c.type===ChannelType.GuildText&&c.topic?.startsWith(prefix));
      if(orphan){
        const recoveredSequence=Number(orphan.topic.slice(prefix.length));
        if(Number.isSafeInteger(recoveredSequence)&&recoveredSequence>0){
          const ticket={channelId:orphan.id,ownerId,type,sequence:recoveredSequence,status:'open',createdAt:new Date().toISOString(),assignedTo:null};
          this.state.sequence=Math.max(this.state.sequence,recoveredSequence);this.state.tickets[orphan.id]=ticket;this.save();
          return {ticket,channel:orphan,existing:true,details};
        }
      }
      const parent=await guild.channels.fetch(this.config.ticketCategoryId);
      if(!parent || parent.type!==ChannelType.GuildCategory)throw new Error('TICKET_CATEGORY_MISSING');
      if(parent.children?.cache?.size>=50)throw new Error('TICKET_CATEGORY_FULL');
      const sequence=++this.state.sequence;this.save();
      const name=`${TYPES[type].slug}-${String(sequence).padStart(4,'0')}`;
      const channel=await guild.channels.create({
        name,type:ChannelType.GuildText,parent:this.config.ticketCategoryId,
        topic:`GN ticket | ${type} | ${ownerId} | open | ${sequence}`,
        permissionOverwrites:ticketOverwrites(this.config,ownerId),
        reason:'Ticket privado solicitado por un miembro de [GN] Guardia Nacional',
      });
      const ticket={channelId:channel.id,ownerId,type,sequence,status:'open',createdAt:new Date().toISOString(),assignedTo:null};
      this.state.tickets[channel.id]=ticket;this.save();
      return {ticket,channel,existing:false,details};
    });
  }
  async claim(channel,member) {
    return this.locks.run(`ticket:${channel.id}`,async()=>{
      const ticket=this.state.tickets[channel.id];
      if(!ticket || ticket.status!=='open')throw new Error('TICKET_NOT_OPEN');
      if(!isStaff(member,this.config))throw new Error('STAFF_ONLY');
      if(ticket.assignedTo && ticket.assignedTo!==member.id)throw new Error('ALREADY_CLAIMED');
      ticket.assignedTo=member.id;this.save();return ticket;
    });
  }
  async close(channel,member) {
    return this.locks.run(`ticket:${channel.id}`,async()=>{
      const ticket=this.state.tickets[channel.id];
      if(!ticket || !['open','closing'].includes(ticket.status))throw new Error('TICKET_NOT_OPEN');
      if(!canClose(member,ticket,this.config))throw new Error('NOT_AUTHORIZED');
      ticket.status='closing';this.save();
      try {
        const closedAt=new Date(this.clock()).toISOString();
        await channel.permissionOverwrites.edit(ticket.ownerId,{ViewChannel:false,SendMessages:false}, 'Cierre de ticket privado confirmado');
        const changes={name:`cerrado-${TYPES[ticket.type].slug}-${String(ticket.sequence).padStart(4,'0')}`,
          topic:`GN ticket | ${ticket.type} | ${ticket.ownerId} | closed | ${ticket.sequence} | ${closedAt}`,
          permissionOverwrites:archiveOverwrites(this.config,ticket.ownerId),
          reason:'Archivo privado del ticket durante 72 horas'};
        if(this.config.archiveClosedTickets){
          await this.locks.run('archive-category',async()=>{
            const guild=channel.guild;
            const all=await guild.channels.fetch();
            const prefix=ARCHIVE_CATEGORY_PREFIX;
            const archives=[...all.values()].filter(isArchiveCategory);
            let archive=archives.find(c=>[...all.values()].filter(child=>child?.parentId===c.id).length<50);
            if(!archive){
              let name=prefix,n=2;while([...all.values()].some(c=>c?.name===name))name=`${prefix} ${n++}`;
              archive=await guild.channels.create({name,type:ChannelType.GuildCategory,permissionOverwrites:archiveOverwrites(this.config),reason:'Archivo privado de tickets cerrados de GN'});
            }
            await channel.edit({...changes,parent:archive.id,lockPermissions:false});
          });
        }else await channel.edit(changes);
        ticket.status='closed';ticket.closedAt=closedAt;ticket.closedBy=member.id;
        ticket.deleteAfter=new Date(Date.parse(closedAt)+ARCHIVE_RETENTION_MS).toISOString();
        this.save();return ticket;
      } catch(error) {
        // A partial close stays private; recovery can retry idempotently.
        this.save();throw error;
      }
    });
  }
}
