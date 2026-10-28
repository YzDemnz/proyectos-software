import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection,ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {ArchiveService,archiveTopic} from './archives.mjs';
import {archiveOverwrites,ARCHIVE_RETENTION_MS} from './domain.mjs';
const config={guildId:'guild',botId:'bot',ownerId:'owner',staffRoleIds:['captain','major','general']};
function fixture(){
 let now=Date.parse('2026-10-20T08:00:00.000Z'),deletes=0,permissionEdits=0;
 const closedAt=new Date(now).toISOString();
 const ticket={channelId:'ticket',ownerId:'requester',type:'report',sequence:1,status:'closed',closedAt};
 const makePermissions=()=>({cache:new Collection(),set:async function(list){permissionEdits++;this.cache=new Collection(list.map(o=>[o.id,o]));}});
 const parent={id:'archive',type:ChannelType.GuildCategory,name:'📁 ┃ ARCHIVO DE EXPEDIENTES',permissionOverwrites:makePermissions()};
 const channel={id:'ticket',type:ChannelType.GuildText,parentId:parent.id,topic:'GN ticket | report | requester | closed | 1',permissionOverwrites:makePermissions(),edit:async function(data){Object.assign(this,data);},delete:async()=>{deletes++;channels.delete('ticket');}};
 const channels=new Collection([[parent.id,parent],[channel.id,channel]]);
 const guild={id:config.guildId,channels:{fetch:async id=>id===undefined?channels:channels.get(id)||null}};
 const state={tickets:{ticket}};
 const service=new ArchiveService(config,state,()=>{},()=>{},()=>now);
 return {state,ticket,channel,parent,channels,guild,service,tick:ms=>now+=ms,get deletes(){return deletes;},get permissionEdits(){return permissionEdits;}};
}
test('archives remain for a full 72 hours from close and then delete once',async()=>{
 const f=fixture();await f.service.reconcile(f.guild);assert.equal(f.deletes,0);assert.equal(Date.parse(f.ticket.deleteAfter)-Date.parse(f.ticket.closedAt),ARCHIVE_RETENTION_MS);
 f.tick(ARCHIVE_RETENTION_MS-1);await f.service.reconcile(f.guild);assert.equal(f.deletes,0);
 f.tick(1);await f.service.reconcile(f.guild);await f.service.reconcile(f.guild);assert.equal(f.deletes,1);assert.equal(f.ticket.deleteReason,'retention-72h');
});
test('restarting does not reset the saved deadline and cleans overdue archives',async()=>{
 const f=fixture();await f.service.reconcile(f.guild);const deadline=f.ticket.deleteAfter;f.tick(ARCHIVE_RETENTION_MS+1);
 const restored=new ArchiveService(config,JSON.parse(JSON.stringify(f.state)),()=>{},()=>{},()=>Date.parse(deadline)+1);await restored.reconcile(f.guild);assert.equal(f.deletes,1);
});
test('open tickets, unrelated channels and channels outside archives never delete',async()=>{
 for(const change of [f=>f.ticket.status='open',f=>f.channel.topic='Unrelated channel',f=>f.parent.name='Ordinary category']){
  const f=fixture();change(f);f.tick(ARCHIVE_RETENTION_MS+1);await f.service.reconcile(f.guild);assert.equal(f.deletes,0);
 }
 const f=fixture();await assert.rejects(()=>f.service.reconcile({...f.guild,id:'other'}),/INVALID_SCOPE/);assert.equal(f.deletes,0);
});
test('staff can read archives but cannot manage channels, permissions, messages or threads',()=>{
 const list=archiveOverwrites(config,'requester');
 for(const id of config.staffRoleIds){const o=list.find(o=>o.id===id);assert(BigInt(o.allow)&P.ViewChannel);assert(BigInt(o.allow)&P.ReadMessageHistory);
  for(const bit of [P.ManageChannels,P.ManageRoles,P.ManageMessages,P.ManageThreads,P.SendMessages])assert(BigInt(o.deny)&bit);
 }
 assert(BigInt(list.find(o=>o.id==='requester').deny)&P.ViewChannel);assert(BigInt(list.find(o=>o.id==='bot').allow)&P.ManageChannels);
});
test('legacy archives without close date receive a full period; missing channels are handled',async()=>{
 const f=fixture();delete f.ticket.closedAt;await f.service.reconcile(f.guild);assert.equal(f.deletes,0);assert.equal(f.channel.topic,archiveTopic(f.ticket));
 f.channels.delete('ticket');await f.service.reconcile(f.guild);assert.equal(f.ticket.status,'deleted');assert.equal(f.ticket.deleteReason,'manual-or-external');
});
test('failed deletion retries later without resetting retention or rewriting permissions',async()=>{
 const f=fixture();await f.service.reconcile(f.guild);const edits=f.permissionEdits;f.tick(ARCHIVE_RETENTION_MS+1);
 const remove=f.channel.delete;f.channel.delete=async()=>{throw new Error('Connection lost');};await assert.rejects(()=>f.service.reconcile(f.guild),/ARCHIVE_RECONCILE_ERRORS/);assert.equal(f.ticket.status,'closed');
 f.channel.delete=remove;await f.service.reconcile(f.guild);assert.equal(f.deletes,1);assert.equal(f.permissionEdits,edits);
});
