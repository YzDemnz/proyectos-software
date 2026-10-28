import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { convertMessages, normalizeReply, validatePayload } from './protocol.ts';

const allowedOrigins = new Set((Deno.env.get('JUDICIAL_WEB_ORIGINS') || 'https://judicial-managment-web.leo-jesmtze11.chatgpt.site,http://127.0.0.1:5186').split(',').map(value => value.trim()));
const provider = Deno.env.get('JUDICIAL_AI_PROVIDER') || 'gemini';
const model = Deno.env.get('JUDICIAL_AI_MODEL') || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.4-mini');
const key = Deno.env.get(provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');
const endpoint = provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : 'https://api.openai.com/v1/chat/completions';
const configured = !!key && ['gemini','openai'].includes(provider);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: 'Origen no permitido.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json(401, { error: 'Inicia sesión para continuar.' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return json(401, { error: 'Tu sesión venció. Inicia sesión nuevamente.' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const factors = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    if (factors.error) return json(503, { error: 'No pudimos verificar tu acceso.' });
    // getUser verifies the signature first. Only then inspect its assurance claim.
    const rawPayload = authorization.slice(7).split('.')[1];
    const claims = JSON.parse(atob(rawPayload.replace(/-/g, '+').replace(/_/g, '/')));
    if (factors.data.factors.some(factor => factor.status === 'verified') && claims.aal !== 'aal2') return json(403, { error: 'Completa la verificación en dos pasos.' });
    const { data: profile, error: profileError } = await admin.from('app_profiles').select('account_status,subscription_status,role').eq('id', user.id).single();
    if (profileError || profile.account_status !== 'active') return json(403, { error: 'Esta cuenta no tiene acceso activo.' });

    // Read a bounded stream; Content-Length is not trusted.
    const reader = req.body?.getReader();
    if (!reader) return json(400, { error: 'Petición vacía.' });
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 120_000) { await reader.cancel(); return json(413, { error: 'La consulta es demasiado extensa. Divide el documento en partes.' }); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset=0; for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
    let body; try { body=JSON.parse(new TextDecoder().decode(bytes)); } catch { return json(400,{error:'La petición no es válida.'}); }
    if (body?.action === 'status') return json(200, { configured, provider, model });
    if (!configured) return json(503, { error: 'El administrador aún debe configurar la API de IA. Tus demás funciones siguen disponibles.' });
    if (!['active','manual'].includes(profile.subscription_status) && !['owner','admin'].includes(profile.role)) return json(403,{error:'Esta función requiere Premium.'});
    const invalid = validatePayload(body);
    if (invalid) return json(400, { error: invalid });
    const requestKey = typeof body.request_id === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id) ? body.request_id : crypto.randomUUID();
    const { data: reservation, error: quotaError } = await admin.rpc('reserve_web_ai_request', { actor: user.id, request_key: requestKey });
    if (quotaError) return json(quotaError.code === '42501' ? 403 : 429, { error: quotaError.message });
    if (!reservation?.allowed) return json(409, { error: 'Esta consulta ya se recibió. Evita enviarla de nuevo.' });
    const messages = convertMessages(body.messages);
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({ model, messages, stream: false, ...(body.tools?.length ? { tools: body.tools, tool_choice: 'auto' } : {}), ...(provider === 'gemini' ? { max_tokens: 4096, reasoning_effort: 'low' } : { max_completion_tokens: 4096, store: false }) }),
    });
    // No automatic retries: an ambiguous provider failure may already have incurred usage.
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: response.status === 429 ? 'El proveedor alcanzó su límite temporal. Intenta más tarde.' : 'El proveedor de IA no pudo completar la consulta. El administrador puede revisar la configuración.' });
    const result = await response.json();
    return json(200, { message: normalizeReply(result.choices?.[0]?.message), remaining: reservation.daily_remaining });
  } catch (error) {
    return json(503, { error: error instanceof Error && /timeout|abort/i.test(error.name) ? 'La consulta tardó demasiado. Intenta una pregunta más breve.' : 'Juris IA no está disponible en este momento. Intenta más tarde.' });
  }
});
