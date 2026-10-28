import { validatePayload, convertMessages, normalizeReply } from '../supabase/functions/judicial-web-ai/protocol.ts';
import assert from 'node:assert/strict';
assert.ok(validatePayload({ action:'chat', messages:[{ role:'user', content:'x'.repeat(70001) }] }));
assert.ok(validatePayload({ action:'chat', messages:[{ role:'admin', content:'hi' }] }));
assert.equal(validatePayload({ action:'chat', messages:[{ role:'user', content:'Consulta' }] }),null);
const messages=convertMessages([
  { role:'assistant', content:'', tool_calls:[{function:{name:'buscar',arguments:{q:'uno'}}},{function:{name:'buscar',arguments:{q:'dos'}}}] },
  { role:'tool', tool_name:'buscar', content:'uno' },
  { role:'tool', tool_name:'buscar', content:'dos' },
]);
assert.equal(messages[1].tool_call_id,messages[0].tool_calls[0].id);
assert.equal(messages[2].tool_call_id,messages[0].tool_calls[1].id);
assert.notEqual(messages[1].tool_call_id,messages[2].tool_call_id);
assert.throws(()=>convertMessages([{role:'tool',tool_name:'missing',content:'no'}]));
assert.deepEqual(normalizeReply({tool_calls:[{function:{name:'buscar',arguments:JSON.stringify({q:'uno'})}}]}).tool_calls[0].function.arguments,{q:'uno'});
console.log('PASS: input bounds, role validation, distinct tool call IDs, unmatched result rejection and provider argument normalization.');
