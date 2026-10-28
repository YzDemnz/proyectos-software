import {
  supabase,
  type AppProfile,
  type AuditLogEntry,
  type ModerationFlag,
  type PlatformDonation,
  type PlatformSecurityAlert,
  type SupportReport,
} from './supabase';

export interface AdminDespachoSummary {
  id: string;
  nombre: string;
  owner_user_id: string;
  deleted_at?: string | null;
  created_at: string;
}

export interface AdminMemberSummary {
  id: string;
  despacho_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface AdminUserRecord extends AppProfile {
  owned_despachos: number;
  total_memberships: number;
  collaborators: number;
  online: boolean;
}

export interface AdminPlatformSnapshot {
  users: AdminUserRecord[];
  despachos: AdminDespachoSummary[];
  members: AdminMemberSummary[];
  donations: PlatformDonation[];
  reports: SupportReport[];
  moderationFlags: ModerationFlag[];
  securityAlerts: PlatformSecurityAlert[];
  auditEvents: AuditLogEntry[];
  loadedAt: string;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const throwFirstError = (responses: Array<{ error: { message: string } | null }>) => {
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw new Error(failed.error.message);
};

export const checkPlatformAdminAccess = async () => {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) return false;
  return data === true;
};

export const loadAdminPlatformSnapshot = async (): Promise<AdminPlatformSnapshot> => {
  const [
    profilesResult,
    despachosResult,
    membersResult,
    donationsResult,
    reportsResult,
    moderationResult,
    securityResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from('app_profiles')
      .select(
        'id,email,role,account_status,subscription_status,subscription_provider,subscription_reference,trial_started_at,trial_ends_at,ban_until,ban_reason,disabled_reason,last_seen_at,usage_seconds,created_at,updated_at',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('despachos')
      .select('id,nombre,owner_user_id,deleted_at,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('despacho_miembros')
      .select('id,despacho_id,user_id,role,created_at'),
    supabase
      .from('platform_donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('support_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('moderation_flags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('platform_security_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
  ]);

  throwFirstError([
    profilesResult,
    despachosResult,
    membersResult,
    donationsResult,
    reportsResult,
    moderationResult,
    securityResult,
    auditResult,
  ]);

  const profiles = (profilesResult.data ?? []) as AppProfile[];
  const despachos = (despachosResult.data ?? []) as AdminDespachoSummary[];
  const members = (membersResult.data ?? []) as AdminMemberSummary[];
  const now = Date.now();

  const users: AdminUserRecord[] = profiles.map((profile) => {
    const ownedDespachoIds = despachos
      .filter((despacho) => despacho.owner_user_id === profile.id && !despacho.deleted_at)
      .map((despacho) => despacho.id);
    const ownedDespachoSet = new Set(ownedDespachoIds);
    const collaborators = new Set(
      members
        .filter((member) => ownedDespachoSet.has(member.despacho_id) && member.user_id !== profile.id)
        .map((member) => member.user_id),
    ).size;
    const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;

    return {
      ...profile,
      owned_despachos: ownedDespachoIds.length,
      total_memberships: members.filter((member) => member.user_id === profile.id).length,
      collaborators,
      online: lastSeen > 0 && now - lastSeen <= ONLINE_WINDOW_MS,
    };
  });

  return {
    users,
    despachos,
    members,
    donations: (donationsResult.data ?? []) as PlatformDonation[],
    reports: (reportsResult.data ?? []) as SupportReport[],
    moderationFlags: (moderationResult.data ?? []) as ModerationFlag[],
    securityAlerts: (securityResult.data ?? []) as PlatformSecurityAlert[],
    auditEvents: (auditResult.data ?? []) as AuditLogEntry[],
    loadedAt: new Date().toISOString(),
  };
};

export interface ModerationContextMessage {
  message_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  is_flagged_message: boolean;
}

export const loadModerationContext = async (flagId: string) => {
  const { data, error } = await supabase.rpc('admin_get_flag_context', { flag_id: flagId });
  if (error) throw new Error(error.message);
  return (data ?? []) as ModerationContextMessage[];
};
