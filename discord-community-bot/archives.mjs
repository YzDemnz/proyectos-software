import {ChannelType} from 'discord.js';
import {ARCHIVE_RETENTION_MS,archiveOverwrites,isArchiveCategory,SerialByKey} from './domain.mjs';
export function archiveTopic(ticket){return `GN ticket | ${ticket.type} | ${ticket.ownerId} | closed | ${ticket.sequence} | ${ticket.closedAt}`;}
function sameOverwrites(channel,expected){
 const normalize=list=>list.map(o=>`${o.id}:${o.type}:${o.allow?.bitfield??o.allow??0}:${o.deny?.bitfield??o.deny??0}`).sort().join(';');
 return normalize([...channel.permissionOverwrites.cache.values()])===normalize(expected);
}
export class ArchiveService{
 constructor(config,state,save,log=()=>{},clock=()=>Date.now(),locks=new SerialByKey()){
  this.config=config;this.state=state;this.save=save;this.log=log;this.clock=clock;this.locks=locks;
 }
 async reconcile(guild){
  if(guild.id!==this.config.guildId)throw new Error('INVALID_SCOPE');
  const all=await guild.channels.fetch(),failures=[];
  for(const category of all.values())if(isArchiveCategory(category)){
   const expected=archiveOverwrites(this.config);
   try{if(!sameOverwrites(category,expected))await category.permissionOverwrites.set(expected,'Archivo protegido: lectura para mandos; gestión reservada al propietario');}catch(error){failures.push(error);}
  }
  for(const ticket of Object.values(this.state.tickets)){
   if(ticket.status!=='closed')continue;
   try{await this.locks.run(`ticket:${ticket.channelId}`,async()=>{
    if(ticket.status!=='closed')return;
    let channel;try{channel=await guild.channels.fetch(ticket.channelId,{force:true});}catch(error){if(error.code!==10003)throw error;}
    if(!channel){ticket.status='deleted';ticket.deletedAt=new Date(this.clock()).toISOString();ticket.deleteReason='manual-or-external';this.save();return;}
    const parent=all.get(channel.parentId);
    const prefix=`GN ticket | ${ticket.type} | ${ticket.ownerId} | closed | ${ticket.sequence}`;
    if(channel.type!==ChannelType.GuildText||!isArchiveCategory(parent)||(channel.topic!==prefix&&!channel.topic?.startsWith(prefix+' | '))){
     this.log('archive-scope-mismatch');return;
    }
    // Existing closed tickets without a known close time get a full retention period.
    if(!Number.isFinite(Date.parse(ticket.closedAt))){ticket.closedAt=new Date(this.clock()).toISOString();this.save();}
    const deadline=Date.parse(ticket.closedAt)+ARCHIVE_RETENTION_MS;
    const deleteAfter=new Date(deadline).toISOString();
    if(ticket.deleteAfter!==deleteAfter){ticket.deleteAfter=deleteAfter;this.save();}
    const expected=archiveOverwrites(this.config,ticket.ownerId);
    if(!sameOverwrites(channel,expected))await channel.permissionOverwrites.set(expected,'Protección de ticket archivado: solo el propietario puede gestionarlo manualmente');
    if(channel.topic!==archiveTopic(ticket))await channel.edit({topic:archiveTopic(ticket),reason:'Fecha de cierre del expediente archivado'});
    if(this.clock()<deadline)return;
    await channel.delete('Ticket archivado: plazo de conservación de 72 horas cumplido');
    ticket.status='deleted';ticket.deletedAt=new Date(this.clock()).toISOString();ticket.deleteReason='retention-72h';this.save();this.log('archived-ticket-expired');
   });}catch(error){failures.push(error);}
  }
  if(failures.length)throw new AggregateError(failures,'ARCHIVE_RECONCILE_ERRORS');
 }
}
