import { supabase } from '../lib/supabase';

export type CloudStatus = { configured: boolean; provider: string; model: string };
export async function getCloudEngineState(): Promise<OllamaState> {
  const status = await getCloudAIStatus();
  return { status: status.configured ? 'ready' : 'not-installed', installed: status.configured, running: status.configured, ready: status.configured, version: status.model, executablePath: null, models: status.configured ? [status.model] : [], checkedAt: new Date().toISOString(), message: status.configured ? 'Servicio de IA conectado.' : 'El administrador debe configurar la API de IA.' };
}
let statusCache: { value: CloudStatus; until: number } | null = null;
export async function getCloudAIStatus(): Promise<CloudStatus> {
  if (statusCache && statusCache.until > Date.now()) return statusCache.value;
  const { data, error } = await supabase.functions.invoke('judicial-web-ai', { body: { action: 'status' } });
  if (error) throw new Error('No pudimos conectar con Juris IA. Intenta de nuevo.');
  const value = data as CloudStatus;
  statusCache = { value, until: Date.now() + 30_000 };
  return value;
}

// Compatibility transport: shared drafting, reports and chat keep their existing tool contract.
// Provider credentials, model choice, entitlement and quotas are enforced by the Edge Function.
export const cloudAIFetch: typeof fetch = async (_url, init) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Inicia sesión para usar Juris IA.');
  const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  delete payload.model;
  delete payload.keep_alive;
  delete payload.options;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/judicial-web-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...payload, action: 'chat', request_id: crypto.randomUUID() }),
    signal: init?.signal ?? AbortSignal.timeout(65_000),
  });
};
