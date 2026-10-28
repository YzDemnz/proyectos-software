import fs from 'node:fs';
import path from 'node:path';
export function atomicWrite(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2),'utf8');
  fs.renameSync(file+'.tmp',file);
}
export function loadState(file) {
  if(!fs.existsSync(file))return {version:1,sequence:0,tickets:{},joins:{}};
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(state.version!==1 || !state.tickets || !state.joins)throw new Error('Invalid persistent bot state');
  return state;
}
export function logger(root) {
  const file=path.join(root,'runtime.log');
  return (event,data={})=>{
    // Callers pass only fixed event names, error codes, counters and status.
    try {
      if(fs.existsSync(file)&&fs.statSync(file).size>1024*1024)fs.renameSync(file,file+'.previous');
      fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),event,...data})+'\n');
    }catch{}
  };
}
