import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection,ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {TicketService,ticketOverwrites,canClose,isStaff,shouldAssignStarter,SerialByKey,safeText} from './domain.mjs';
import {panelPayload,ticketModal,openingPayload} from './ui.mjs';
const config={guildId:'900074637307453016',botId:'900048003608092974',ownerId:'900093714330985990',staffRoleIds:['900006267095144276','900277528741385465'],rankRoleIds:['900195878213101933','900190459699885393','900006267095144276','900277528741385465'],starterRoleId:'900195878213101933',ticketCategoryId:'900249010543393163'};
function member(id='900014603120823667',roles=[],extra={}){return {id,guild:{id:config.guildId},user:{bot:false},pending:false,roles:{cache:new Collection(roles.map(r=>[r,{id:r}]))},...extra};}
function fixture(){
 const channels=new Map(),created=[];
 const category={id:config.ticketCategoryId,type:ChannelType.GuildCategory,children:{cache:new Map()}};
 channels.set(category.id,category);
 const guild={id:config.guildId,channels:{fetch:async id=>id===undefined?channels:channels.get(id)||null,create:async options=>{
   const id=String(900000000000000000n+BigInt(created.length));
   const channel={id,guild,name:options.name,parentId:options.parent,topic:options.topic,type:options.type,options,permissionOverwrites:{edit:async()=>{}},edit:async args=>{Object.assign(channel,args);if(args.parent)channel.parentId=args.parent;}};
   channels.set(id,channel);created.push(channel);return channel;
 }}};
 const state={version:1,sequence:0,tickets:{},joins:{}};
 const service=new TicketService({...config},state,()=>{});
 return {guild,channels,created,state,service};
}
test('new humans receive the base rank; bots, screened members and ranked members do not',()=>{
 assert.equal(shouldAssignStarter(member(),config),true);
 assert.equal(shouldAssignStarter(member(undefined,[],{user:{bot:true}}),config),false);
 assert.equal(shouldAssignStarter(member(undefined,[],{pending:true}),config),false);
 assert.equal(shouldAssignStarter(member(undefined,[config.starterRoleId]),config),false);
 assert.equal(shouldAssignStarter(member(undefined,['900006267095144276']),config),false);
 assert.equal(shouldAssignStarter(member(undefined,[],{guild:{id:'other'}}),config),false);
});
test('ticket staff starts at Captain; lower ranks cannot claim or close other tickets',()=>{
 const ticket={ownerId:'900014603120823667'};
 const lower=member('900232843181394649',['900190459699885393']);
 const captain=member('900232843181394649',['900006267095144276']);
 assert.equal(isStaff(lower,config),false);assert.equal(isStaff(captain,config),true);
 assert.equal(canClose(lower,ticket,config),false);assert.equal(canClose(captain,ticket,config),true);
 assert.equal(canClose(member(ticket.ownerId),ticket,config),true);
 assert.equal(canClose(member(config.ownerId),ticket,config),true);
});
test('private ticket creation denies everyone and grants only captain ranks, bot and creator',()=>{
 const overwrites=ticketOverwrites(config,'900014603120823667');
 assert.ok(BigInt(overwrites.find(o=>o.id===config.guildId).deny)&P.ViewChannel);
 assert.ok(!overwrites.some(o=>o.id==='900190459699885393'));
 assert.deepEqual(overwrites.filter(o=>o.type===0&&BigInt(o.allow)&P.ViewChannel).map(o=>o.id),config.staffRoleIds);
 assert.ok(BigInt(overwrites.find(o=>o.id==='900014603120823667').allow)&P.ViewChannel);
 assert.ok(BigInt(overwrites.find(o=>o.id===config.botId).allow)&P.ManageChannels);
});
test('concurrent submissions create one private channel per user and ticket type',async()=>{
 const f=fixture();const args=[f.guild,'900014603120823667','report',{}];
 const results=await Promise.all([f.service.open(...args),f.service.open(...args),f.service.open(...args)]);
 assert.equal(f.created.length,1);assert.equal(results.filter(r=>!r.existing).length,1);
 assert.ok(f.created[0].options.permissionOverwrites.some(o=>o.id===config.guildId&&BigInt(o.deny)&P.ViewChannel));
 await f.service.open(f.guild,'900014603120823667','training',{});assert.equal(f.created.length,2);
});
test('another guild and unsupported ticket kinds fail before any channel creation',async()=>{
 const f=fixture();await assert.rejects(()=>f.service.open({...f.guild,id:'other'},'user','report',{}),/INVALID_SCOPE/);
 await assert.rejects(()=>f.service.open(f.guild,'user','fake',{}),/INVALID_SCOPE/);assert.equal(f.created.length,0);
});
test('a lost creation response is recovered instead of making a duplicate private channel',async()=>{
 const f=fixture();const result=await f.service.open(f.guild,'900014603120823667','report',{});
 delete f.state.tickets[result.channel.id];
 const recovered=await f.service.open(f.guild,'900014603120823667','report',{});
 assert.equal(recovered.existing,true);assert.equal(recovered.channel.id,result.channel.id);assert.equal(f.created.length,1);
});
test('close checks authorization, hides the requester and archives without deleting history',async()=>{
 const f=fixture();const result=await f.service.open(f.guild,'900014603120823667','promotion',{});
 const calls=[];result.channel.permissionOverwrites.edit=async(...args)=>calls.push(args);
 await assert.rejects(()=>f.service.close(result.channel,member('900232843181394649')),/NOT_AUTHORIZED/);
 assert.equal(calls.length,0);
 await f.service.close(result.channel,member('900014603120823667'));
 assert.equal(result.ticket.status,'closed');assert.equal(calls[0][1].ViewChannel,false);
 assert.match(result.channel.name,/^cerrado-ascenso-/);assert.ok(f.channels.has(result.channel.id));
});
test('failed permission update keeps closing state recoverable and cannot be duplicated',async()=>{
 const f=fixture();const result=await f.service.open(f.guild,'900014603120823667','report',{});
 result.channel.permissionOverwrites.edit=async()=>{throw new Error('Discord unavailable');};
 await assert.rejects(()=>f.service.close(result.channel,member(result.ticket.ownerId)),/Discord unavailable/);
 assert.equal(result.ticket.status,'closing');
 assert.equal((await f.service.open(f.guild,result.ticket.ownerId,'report',{})).existing,true);
 result.channel.permissionOverwrites.edit=async()=>{};
 await f.service.close(result.channel,member(config.ownerId));assert.equal(result.ticket.status,'closed');
});
test('closed tickets move to a private archive without replacing their member restrictions',async()=>{
 const f=fixture();f.service.config.archiveClosedTickets=true;
 const result=await f.service.open(f.guild,'900014603120823667','report',{});
 await f.service.close(result.channel,member(result.ticket.ownerId));
 const archive=f.created.find(c=>c.type===ChannelType.GuildCategory);
 assert.ok(archive);assert.equal(result.channel.parentId,archive.id);assert.equal(result.channel.lockPermissions,false);
 assert.ok(BigInt(archive.options.permissionOverwrites.find(o=>o.id===config.guildId).deny)&P.ViewChannel);
 assert.equal(result.ticket.status,'closed');
});
test('only a Captain or higher can claim; a second staff member cannot overwrite assignment',async()=>{
 const f=fixture();const result=await f.service.open(f.guild,'900014603120823667','training',{});
 await assert.rejects(()=>f.service.claim(result.channel,member('900232843181394649',['900190459699885393'])),/STAFF_ONLY/);
 await f.service.claim(result.channel,member('900232843181394649',['900006267095144276']));
 await assert.rejects(()=>f.service.claim(result.channel,member('900158793124262241',['900277528741385465'])),/ALREADY_CLAIMED/);
});
test('panel and modals serialize to Discord limits with all three requested routes',()=>{
 const panel=panelPayload();assert.equal(panel.components[0].toJSON().components.length,3);
 for(const type of ['report','training','promotion'])assert.equal(ticketModal(type).toJSON().components.length,3);
 const opening=openingPayload({type:'report',ownerId:'900014603120823667',sequence:1},{details:'*'.repeat(3500),subject:'a',evidence:'*'.repeat(1000)});
 assert.ok(opening.embeds[0].toJSON().description.length<=3500);
 assert.deepEqual(opening.allowedMentions.parse,[]);assert.ok(safeText('*'.repeat(4000),1024).length<=1024);
});
