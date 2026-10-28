import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

const allowedChannels = new Set(['laboratory', 'beta', 'stable']);
const allowedPlatforms = new Set(['all', 'win32', 'darwin', 'linux']);
const allowedModels = new Set(['low', 'medium', 'high', 'professional']);

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const webhookSecret = Deno.env.get('AI_DEPLOYMENT_WEBHOOK_SECRET') ?? '';
  const suppliedSecret = request.headers.get('x-deployment-secret') ?? '';
  const expected = new TextEncoder().encode(webhookSecret);
  const supplied = new TextEncoder().encode(suppliedSecret);
  if (!webhookSecret || supplied.length !== expected.length) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected[index] ^ supplied[index];
  if (mismatch !== 0) return jsonResponse({ error: 'unauthorized' }, 401);

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const releaseVersion = String(payload?.release_version ?? '').trim();
  const channel = String(payload?.channel ?? 'stable').trim();
  const platform = String(payload?.platform ?? 'all').trim();
  const modelTier = String(payload?.model_tier ?? '').trim();
  const modelId = String(payload?.model_id ?? modelTier).trim();
  const title = String(payload?.title ?? '').trim();
  const notes = String(payload?.notes ?? '').trim().slice(0, 2000);
  const minimumAppVersion = String(payload?.minimum_app_version ?? '').trim() || null;
  const requestedRolloutPercentage = Number(payload?.rollout_percentage ?? 100);
  const rolloutPercentage = Math.max(1, Math.min(100, requestedRolloutPercentage));
  const autoInstallAllowed = payload?.auto_install_allowed === true;

  if (!/^\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?$/.test(releaseVersion)
      || !allowedChannels.has(channel)
      || !allowedPlatforms.has(platform)
      || !allowedModels.has(modelTier)
      || !allowedModels.has(modelId)
      || modelId !== modelTier
      || !Number.isInteger(requestedRolloutPercentage)
      || requestedRolloutPercentage < 1
      || requestedRolloutPercentage > 100
      || title.length < 1
      || title.length > 160) {
    return jsonResponse({ error: 'invalid_deployment_payload' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_configuration_missing' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (channel === 'stable') {
    const { error: revokeError } = await supabase
      .from('ai_model_deployments')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('status', 'published')
      .eq('channel', channel)
      .eq('platform', platform)
      .eq('model_tier', modelTier);
    if (revokeError) return jsonResponse({ error: 'revoke_failed', detail: revokeError.message }, 500);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_model_deployments')
    .insert({
      release_version: releaseVersion,
      channel,
      platform,
      model_tier: modelTier,
      model_id: modelId,
      title,
      notes,
      minimum_app_version: minimumAppVersion,
      rollout_percentage: rolloutPercentage,
      auto_install_allowed: autoInstallAllowed,
      status: 'published',
      published_at: now,
      updated_at: now,
    })
    .select('id,release_version,channel,platform,model_tier,model_id,published_at')
    .single();

  if (error) return jsonResponse({ error: 'publish_failed', detail: error.message }, 500);
  return jsonResponse({ ok: true, deployment: data }, 201);
});
