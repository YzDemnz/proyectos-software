import { supabase } from './supabase';
import type { JurisAIProfileId } from './jurisAI';

export const JURIS_AUTO_MODEL_UPDATES_KEY = 'jm-juris-auto-model-updates';
export const JURIS_LAST_MODEL_DEPLOYMENT_KEY = 'jm-juris-last-model-deployment';

export interface AIModelDeployment {
  id: string;
  release_version: string;
  channel: 'laboratory' | 'beta' | 'stable';
  platform: 'all' | 'win32' | 'darwin' | 'linux';
  model_tier: JurisAIProfileId;
  model_id: JurisAIProfileId;
  title: string;
  notes: string;
  minimum_app_version?: string | null;
  rollout_percentage: number;
  auto_install_allowed: boolean;
  published_at?: string | null;
  created_at: string;
}

const modelTierOrder: JurisAIProfileId[] = ['low', 'medium', 'high', 'professional'];
const knownModelIds = new Set<JurisAIProfileId>(modelTierOrder);

const normalizePlatform = (platform?: string): AIModelDeployment['platform'] => {
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') return platform;
  return 'win32';
};

const deterministicRolloutBucket = (userId: string) => {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
};

const parseVersion = (value?: string | null) => String(value ?? '')
  .split(/[.-]/)
  .slice(0, 3)
  .map((part) => Number.parseInt(part, 10) || 0);

const satisfiesMinimumVersion = (currentVersion: string, minimumVersion?: string | null) => {
  if (!minimumVersion) return true;
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(minimumVersion);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
};

export const resolveAIModelDeployment = ({
  deployments,
  recommendedTier,
  platform,
  userId,
  appVersion,
}: {
  deployments: AIModelDeployment[];
  recommendedTier: JurisAIProfileId;
  platform?: string;
  userId: string;
  appVersion: string;
}) => {
  const targetPlatform = normalizePlatform(platform);
  const maximumTier = modelTierOrder.indexOf(recommendedTier);
  const bucket = deterministicRolloutBucket(userId);

  return deployments
    .filter((deployment) => deployment.channel === 'stable')
    .filter((deployment) => deployment.platform === 'all' || deployment.platform === targetPlatform)
    .filter((deployment) => knownModelIds.has(deployment.model_id))
    .filter((deployment) => deployment.model_id === deployment.model_tier)
    .filter((deployment) => modelTierOrder.indexOf(deployment.model_tier) <= maximumTier)
    .filter((deployment) => bucket < deployment.rollout_percentage)
    .filter((deployment) => satisfiesMinimumVersion(appVersion, deployment.minimum_app_version))
    .sort((left, right) => {
      const tierDifference = modelTierOrder.indexOf(right.model_tier) - modelTierOrder.indexOf(left.model_tier);
      if (tierDifference !== 0) return tierDifference;
      return new Date(right.published_at ?? right.created_at).getTime()
        - new Date(left.published_at ?? left.created_at).getTime();
    })[0] ?? null;
};

export const loadAIModelDeployments = async () => {
  const { data, error } = await supabase
    .from('ai_model_deployments')
    .select('id,release_version,channel,platform,model_tier,model_id,title,notes,minimum_app_version,rollout_percentage,auto_install_allowed,published_at,created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(40);

  if (error?.code === 'PGRST205' || error?.code === '42P01') return [];
  if (error) throw error;
  return (data ?? []) as AIModelDeployment[];
};

export const loadResolvedAIModelDeployment = async ({
  recommendedTier,
  platform,
  appVersion,
}: {
  recommendedTier: JurisAIProfileId;
  platform?: string;
  appVersion: string;
}) => {
  const [{ data: { user } }, deployments] = await Promise.all([
    supabase.auth.getUser(),
    loadAIModelDeployments(),
  ]);
  if (!user) return null;
  return resolveAIModelDeployment({
    deployments,
    recommendedTier,
    platform,
    userId: user.id,
    appVersion,
  });
};

export const subscribeAIModelDeployments = (onChange: () => void) => {
  const channel = supabase
    .channel(`ai-model-deployments:${crypto.randomUUID()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ai_model_deployments',
    }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel).catch(() => undefined);
  };
};

export const getAutomaticModelUpdatesEnabled = () => (
  window.localStorage.getItem(JURIS_AUTO_MODEL_UPDATES_KEY) === 'true'
);

export const setAutomaticModelUpdatesEnabled = (enabled: boolean) => {
  window.localStorage.setItem(JURIS_AUTO_MODEL_UPDATES_KEY, enabled ? 'true' : 'false');
};
