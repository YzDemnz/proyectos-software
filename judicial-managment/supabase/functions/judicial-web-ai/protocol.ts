type ToolCall = { id?: string; function: { name: string; arguments?: Record<string, unknown> } };
type InputMessage = { role: string; content: string; tool_calls?: ToolCall[]; tool_name?: string };
export function validatePayload(body: unknown): string | null {
  const value=body as {action?:string;messages?:InputMessage[];tools?:unknown[]};
  if(value?.action!=='chat'||!Array.isArray(value.messages)||value.messages.length<1||value.messages.length>40) return 'La conversación no es válida.';
  let characters=0;
  for(const message of value.messages){
    if(!message||!['system','user','assistant','tool'].includes(message.role)||typeof message.content!=='string')return 'La conversación no es válida.';
    characters+=message.content.length;
    if(message.tool_calls&&(!Array.isArray(message.tool_calls)||message.tool_calls.length>12||message.tool_calls.some(call=>!call?.function||typeof call.function.name!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(call.function.name))))return 'La acción solicitada no es válida.';
  }
  if(characters>70_000)return 'El contexto es demasiado extenso. Divide la consulta en partes.';
  if(value.tools!==undefined&&(!Array.isArray(value.tools)||value.tools.length>24))return 'Las herramientas no son válidas.';
  return null;
}
export function convertMessages(messages:InputMessage[]){
  const pending: {name:string;id:string}[]=[];
  return messages.map((message,index)=>{
    if(message.role==='assistant'&&message.tool_calls?.length){
      return {role:'assistant',content:message.content||null,tool_calls:message.tool_calls.map((call,position)=>{const id=`call_${index}_${position}`;pending.push({name:call.function.name,id});return {id,type:'function',function:{name:call.function.name,arguments:JSON.stringify(call.function.arguments??{})}};})};
    }
    if(message.role==='tool'){
      const position=pending.findIndex(call=>call.name===message.tool_name);
      if(position<0)throw new Error('Unmatched tool response');
      const [call]=pending.splice(position,1);
      return {role:'tool',tool_call_id:call.id,content:message.content};
    }
    return {role:message.role,content:message.content};
  });
}
export function normalizeReply(message:{content?:string;tool_calls?:{function:{name:string;arguments:string}}[]}|undefined){
  return {role:'assistant',content:message?.content??'',tool_calls:message?.tool_calls?.map(call=>({function:{name:call.function.name,arguments:JSON.parse(call.function.arguments||'{}')}}))??[]};
}
