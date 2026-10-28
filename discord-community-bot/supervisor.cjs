'use strict';
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const root=__dirname;
let worker,stopping=false,startedAt=0;
const log=(event)=>{try{const file=path.join(root,'supervisor.log');if(fs.existsSync(file)&&fs.statSync(file).size>1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),event})+'\n');}catch{}};
const lock=net.createServer();
lock.on('error',()=>process.exit(0));
function start(){
 if(stopping)return;
 startedAt=Date.now();
 worker=spawn(process.execPath,[path.join(root,'bot.mjs')],{cwd:root,windowsHide:true,stdio:'ignore'});
 fs.writeFileSync(path.join(root,'supervisor-status.json'),JSON.stringify({pid:process.pid,workerPid:worker.pid,startedAt:new Date().toISOString()}));
 worker.on('error',()=>log('worker-spawn-error'));
 worker.on('exit',()=>{log('worker-stopped');if(!stopping)setTimeout(start,15000);});
}
setInterval(()=>{
 if(!worker||worker.exitCode!==null||Date.now()-startedAt<120000)return;
 try{
  const health=JSON.parse(fs.readFileSync(path.join(root,'health.json'),'utf8'));
  if(Date.now()-Date.parse(health.updatedAt)>180000||(!health.ready&&Date.now()-startedAt>300000)){log('worker-health-stale');worker.kill();}
 }catch{log('worker-health-missing');worker.kill();}
},60000);
function stop(){stopping=true;if(worker)worker.kill();lock.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
lock.listen('\\\\.\\pipe\\codex-gn-900074637307453016-supervisor',()=>{log('supervisor-started');start();});
