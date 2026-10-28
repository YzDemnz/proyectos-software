import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArchiveRestore, Camera, ChevronDown, Copy, Crown, HardDriveDownload, KeyRound, LifeBuoy, Loader2, MapPin, Palette, Settings, Shield, ShieldCheck, Sparkles, Upload, Users, X, type LucideIcon } from 'lucide-react';
import {
  supabase,
  type Despacho,
  type DespachoInvitation,
  type DespachoMember,
  type DespachoRole,
} from '../lib/supabase';
import SecuritySettings from './SecuritySettings';
import AccountSettings from './AccountSettings';
import JurisPersonalization from './JurisPersonalization';
import SupportReports from './SupportReports';
import { RegionalLocationSummary } from './RegionalLocationDialog';
import { copyTextToClipboard } from '../lib/clipboard';
import { createDespachoBackup, saveDespachoBackup, type DespachoBackupSummary } from '../lib/despachoBackup';
import type { RegionalLocationContext } from '../lib/regionalLocation';

interface ConfiguracionProps {
  despacho: Despacho;
  currentMembership: DespachoMember;
  refreshToken?: number;
  premiumAccess: boolean;
  onUpgrade: () => void;
  regionalContext: RegionalLocationContext;
  onConfigureRegion: () => void;
}

type SettingsPanelId = 'account' | 'region' | 'juris' | 'team' | 'backups' | 'support';

function SettingsPanel({
  icon: Icon,
  title,
  description,
  open,
  badge,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  open: boolean;
  badge?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/70 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-950 dark:text-white">{title}</span>
            {badge && <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{badge}</span>}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30 sm:p-5">{children}</div>}
    </section>
  );
}

const roleLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

const genericNameLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Colaborador',
  viewer: 'Solo lectura',
};

const defaultProfileColor = '#1D4ED8';
const profileColorOptions = ['#1D4ED8', '#0F766E', '#7C3AED', '#BE123C', '#C2410C', '#334155'];
const ownerAssignableRoles: Array<Exclude<DespachoRole, 'owner'>> = ['admin', 'editor', 'viewer'];
const adminAssignableRoles: Array<Extract<DespachoRole, 'editor' | 'viewer'>> = ['editor', 'viewer'];

interface DailyCodeResult {
  codigo: string;
  expires_at?: string | null;
  valid_on?: string | null;
}

const normalizeDailyCodeResult = (data: unknown): DailyCodeResult | null => {
  if (Array.isArray(data)) return (data[0] as DailyCodeResult | undefined) ?? null;
  return (data as DailyCodeResult | null) ?? null;
};

const isInvitationActive = (invitation: DespachoInvitation) => {
  return !invitation.revoked && (!invitation.expires_at || new Date(invitation.expires_at) > new Date());
};

const formatInviteExpiration = (dateValue?: string | null) => {
  if (!dateValue) return 'Caduca al terminar el día';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

export default function Configuracion({ despacho, currentMembership, refreshToken = 0, premiumAccess, onUpgrade, regionalContext, onConfigureRegion }: ConfiguracionProps) {
  const [members, setMembers] = useState<DespachoMember[]>([]);
  const [invitations, setInvitations] = useState<DespachoInvitation[]>([]);
  const [latestCode, setLatestCode] = useState('');
  const [latestCodeExpiresAt, setLatestCodeExpiresAt] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<DespachoMember | null>(null);
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    profile_color: defaultProfileColor,
    avatar_url: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastBackupSummary, setLastBackupSummary] = useState<DespachoBackupSummary | null>(null);
  const [mfaRevision, setMfaRevision] = useState(0);
  const [openPanels, setOpenPanels] = useState<Set<SettingsPanelId>>(() => new Set(['account']));
  const canAdmin = currentMembership.role === 'owner' || currentMembership.role === 'admin';
  const canExportBackups = currentMembership.role === 'owner';
  const currentCode = latestCode || invitations.find(isInvitationActive)?.codigo || '';
  const currentCodeExpiresAt =
    latestCodeExpiresAt || invitations.find((invitation) => invitation.codigo === currentCode)?.expires_at || null;
  const profileTargetName = profileTarget
    ? (profileTarget.display_name?.trim() || '')
    : '';
  const isOwnProfile = Boolean(profileTarget && profileTarget.user_id === currentMembership.user_id);
  const handleMfaStateChange = useCallback(() => setMfaRevision((current) => current + 1), []);
  const togglePanel = (panelId: SettingsPanelId) => {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  };

  const fetchSettings = useCallback(async () => {
    const [{ data: memberData }, { data: invitationData }] = await Promise.all([
      supabase
        .from('despacho_miembros')
        .select('*')
        .eq('despacho_id', despacho.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('despacho_invitaciones')
        .select('*')
        .eq('despacho_id', despacho.id)
        .eq('revoked', false)
        .order('created_at', { ascending: false }),
    ]);

    setMembers((memberData ?? []) as DespachoMember[]);
    const activeInvitations = ((invitationData ?? []) as DespachoInvitation[]).filter(isInvitationActive);
    setInvitations(activeInvitations);
    setLatestCode(activeInvitations[0]?.codigo ?? '');
    setLatestCodeExpiresAt(activeInvitations[0]?.expires_at ?? null);
  }, [despacho.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, refreshToken]);

  const backupStorageKey = `judicial-despacho-backup:${despacho.id}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(backupStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { createdAt?: string; summary?: DespachoBackupSummary };
      setLastBackupAt(parsed.createdAt ?? null);
      setLastBackupSummary(parsed.summary ?? null);
    } catch {
      setLastBackupAt(null);
      setLastBackupSummary(null);
    }
  }, [backupStorageKey]);

  const handleCreateBackup = useCallback(async (automatic = false) => {
    if (!canExportBackups || backupInProgress) return;
    setBackupInProgress(true);
    setBackupMessage(automatic ? 'Creando respaldo automático con los datos y adjuntos del despacho...' : 'Preparando respaldo del despacho...');

    try {
      const archive = await createDespachoBackup({ despachoId: despacho.id, despachoName: despacho.nombre });
      const saved = await saveDespachoBackup({ archive, automatic });
      if (!saved.ok) {
        if (!saved.canceled) setBackupMessage(saved.error ?? 'No se pudo guardar el respaldo.');
        return;
      }

      const createdAt = new Date().toISOString();
      window.localStorage.setItem(backupStorageKey, JSON.stringify({ createdAt, summary: archive.summary }));
      setLastBackupAt(createdAt);
      setLastBackupSummary(archive.summary);
      setBackupMessage(saved.filePath
        ? `Respaldo guardado en ${saved.filePath}`
        : 'Respaldo descargado correctamente.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'No se pudo crear el respaldo.');
    } finally {
      setBackupInProgress(false);
    }
  }, [backupInProgress, backupStorageKey, canExportBackups, despacho.id, despacho.nombre]);

  useEffect(() => {
    if (!canExportBackups || !window.judicialDesktop?.saveDespachoBackup || backupInProgress) return;
    const lastBackupTime = lastBackupAt ? new Date(lastBackupAt).getTime() : 0;
    const hasRecentBackup = Number.isFinite(lastBackupTime) && Date.now() - lastBackupTime < 7 * 24 * 60 * 60 * 1000;
    if (hasRecentBackup) return;

    const timer = window.setTimeout(() => {
      handleCreateBackup(true).catch(() => undefined);
    }, 1_800);
    return () => window.clearTimeout(timer);
  }, [backupInProgress, canExportBackups, handleCreateBackup, lastBackupAt]);

  const handleGenerateCode = async () => {
    setMessage('');
    const { data, error } = await supabase.rpc('get_daily_despacho_code', {
      target_despacho_id: despacho.id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const codeResult = normalizeDailyCodeResult(data);
    setLatestCode(codeResult?.codigo ?? '');
    setLatestCodeExpiresAt(codeResult?.expires_at ?? null);
    setMessage('Código diario listo. Quien se una entrará como solo lectura.');
    fetchSettings();
  };

  const handleCopyCode = async () => {
    if (!currentCode) return;
    const copied = await copyTextToClipboard(currentCode);
    if (!copied) {
      setMessage('No se pudo copiar el código. Selecciónalo manualmente e intenta de nuevo.');
      return;
    }

    setCopiedCode(true);
    setMessage('Código copiado.');
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleRoleChange = async (member: DespachoMember, role: DespachoRole) => {
    if (member.role === 'owner') return;

    const { error } = await supabase.rpc('update_despacho_member_role', {
      target_member_id: member.id,
      new_role: role,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Permiso actualizado.');
    fetchSettings();
  };

  const canChangeMemberRole = (member: DespachoMember) => {
    if (member.role === 'owner') return false;
    if (currentMembership.role === 'owner') return true;
    return currentMembership.role === 'admin' && (member.role === 'editor' || member.role === 'viewer');
  };

  const getAssignableRoles = (member: DespachoMember) => {
    if (currentMembership.role === 'owner') return ownerAssignableRoles;
    if (currentMembership.role === 'admin' && (member.role === 'editor' || member.role === 'viewer')) {
      return adminAssignableRoles;
    }

    return [];
  };

  const getGenericMemberName = (member: DespachoMember) => {
    if (member.role === 'owner') return genericNameLabels.owner;

    const sameRoleMembers = members
      .filter((item) => item.role === member.role)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const roleIndex = sameRoleMembers.findIndex((item) => item.id === member.id) + 1;

    return `${genericNameLabels[member.role]} ${roleIndex || 1}`;
  };

  const getMemberDisplayName = (member: DespachoMember) => {
    return member.display_name?.trim() || getGenericMemberName(member);
  };

  const getMemberColor = (member: DespachoMember) => {
    return member.profile_color || defaultProfileColor;
  };

  const openProfileModal = (member: DespachoMember) => {
    setProfileTarget(member);
    setProfileForm({
      display_name: member.display_name ?? '',
      profile_color: member.profile_color ?? defaultProfileColor,
      avatar_url: member.avatar_url ?? '',
    });
    setMessage('');
  };

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file || !profileTarget || !isOwnProfile) return;

    if (!file.type.startsWith('image/')) {
      setMessage('La foto de perfil debe ser una imagen PNG, JPG o WEBP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('La foto debe pesar menos de 2 MB.');
      return;
    }

    setUploadingAvatar(true);
    setMessage('');

    const rawExtension = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const extension = ['png', 'jpg', 'jpeg', 'webp'].includes(rawExtension) ? rawExtension : 'png';
    const storagePath = `despachos/${despacho.id}/users/${profileTarget.user_id}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from('profile-avatars')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      setMessage(error.message);
      setUploadingAvatar(false);
      return;
    }

    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(storagePath);
    setProfileForm((current) => ({ ...current, avatar_url: data.publicUrl }));
    setUploadingAvatar(false);
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileTarget || !isOwnProfile) return;

    setSavingProfile(true);
    setMessage('');

    const { error } = await supabase.rpc('update_my_despacho_profile', {
      target_member_id: profileTarget.id,
      profile_display_name: profileForm.display_name.trim(),
      profile_color_value: profileForm.profile_color,
      profile_avatar_url: profileForm.avatar_url,
    });

    if (error) {
      setMessage(error.message);
      setSavingProfile(false);
      return;
    }

    setMessage('Perfil actualizado.');
    setProfileTarget(null);
    setSavingProfile(false);
    fetchSettings();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-md">
          <Settings className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Configuración</h2>
          <p className="text-sm text-slate-500">{despacho.nombre}</p>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <div className="border-y border-slate-200 dark:border-slate-700">
        <SettingsPanel
          icon={ShieldCheck}
          title="Cuenta y seguridad"
          description="Correo, recuperación, contraseña y verificación en 2 pasos."
          open={openPanels.has('account')}
          onToggle={() => togglePanel('account')}
        >
          <div className="space-y-4">
            <AccountSettings mfaRevision={mfaRevision} />
            <SecuritySettings onMfaStateChange={handleMfaStateChange} />
          </div>
        </SettingsPanel>

        <SettingsPanel
          icon={MapPin}
          title="Región judicial"
          description="Estado, municipio y catálogo de órganos jurisdiccionales."
          badge={regionalContext.status === 'supported' ? 'Disponible' : undefined}
          open={openPanels.has('region')}
          onToggle={() => togglePanel('region')}
        >
          <RegionalLocationSummary context={regionalContext} onOpen={onConfigureRegion} />
        </SettingsPanel>

        <SettingsPanel
          icon={Sparkles}
          title="Personaliza a Juris"
          description="Tono, instrucciones y documentos privados de referencia."
          badge={premiumAccess ? 'Premium activo' : 'Premium'}
          open={openPanels.has('juris')}
          onToggle={() => togglePanel('juris')}
        >
          {premiumAccess ? (
            <JurisPersonalization despachoId={despacho.id} canManage={canAdmin} />
          ) : (
            <div className="flex flex-col items-start justify-between gap-4 border-y border-amber-200 bg-amber-50 px-4 py-5 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center">
              <div className="flex gap-3">
                <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div>
                  <p className="font-semibold text-amber-950 dark:text-amber-100">Tus formatos privados son una función Premium</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">Al activarla, Juris prioriza los documentos y el estilo del despacho antes que la biblioteca general.</p>
                </div>
              </div>
              <button type="button" onClick={onUpgrade} className="shrink-0 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800">Activar Premium</button>
            </div>
          )}
        </SettingsPanel>

        <SettingsPanel
          icon={LifeBuoy}
          title="Soporte y reportes"
          description="Envía incidencias, sugerencias o solicitudes a administración."
          open={openPanels.has('support')}
          onToggle={() => togglePanel('support')}
        >
          <SupportReports />
        </SettingsPanel>
      </div>

      {canExportBackups && (
      <div className="border-y border-slate-200 dark:border-slate-700">
      <SettingsPanel
        icon={ArchiveRestore}
        title="Respaldos del despacho"
        description="Exportación privada y respaldo local del propietario."
        open={openPanels.has('backups')}
        onToggle={() => togglePanel('backups')}
      >
      <section className="rounded-md border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="rounded-md bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
              <ArchiveRestore className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-950 dark:text-white">Respaldos del despacho</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Exporta los expedientes, clientes, calendario, escritos y adjuntos en un ZIP privado. La app de escritorio crea un respaldo automático semanal en la carpeta Documentos del propietario.</p>
            </div>
          </div>
          <button type="button" onClick={() => handleCreateBackup(false)} disabled={backupInProgress} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
            {backupInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
            {backupInProgress ? 'Creando respaldo...' : 'Exportar despacho'}
          </button>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950/40">
          <p className="font-medium text-slate-800 dark:text-slate-100">{lastBackupAt ? `Último respaldo: ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastBackupAt))}` : 'Aún no hay un respaldo registrado en este equipo.'}</p>
          {lastBackupSummary && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{lastBackupSummary.expedienteCount} expedientes, {lastBackupSummary.clientCount} clientes, {lastBackupSummary.documentCount} adjuntos y {lastBackupSummary.includedFileCount} archivos incluidos.</p>}
          {backupMessage && <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">{backupMessage}</p>}
        </div>
      </section>
      </SettingsPanel>
      </div>
      )}

      <div className="border-y border-slate-200 dark:border-slate-700">
      <SettingsPanel
        icon={Users}
        title="Colaboradores e invitaciones"
        description="Perfiles, permisos y código diario para añadir el despacho."
        open={openPanels.has('team')}
        onToggle={() => togglePanel('team')}
      >
      <div className="space-y-4">
      <section className="bg-white border border-blue-100 rounded-md shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-700" />
          <h3 className="font-semibold text-slate-950">Colaboradores</h3>
          <span className="ml-auto text-sm text-slate-500">{members.length}</span>
        </div>

        <div className="divide-y divide-slate-200">
          {members.map((member) => (
            <div key={member.id} className="px-5 py-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => openProfileModal(member)}
                className="min-w-0 flex flex-1 items-center gap-4 text-left"
              >
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-blue-100"
                  />
                ) : (
                  <div
                    className="h-11 w-11 rounded-full text-white flex items-center justify-center font-semibold"
                    style={{ backgroundColor: getMemberColor(member) }}
                  >
                    {getMemberDisplayName(member).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="font-semibold truncate"
                    style={{ color: getMemberColor(member) }}
                  >
                    {getMemberDisplayName(member)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {roleLabels[member.role]} - {member.email}
                  </p>
                  {!member.display_name && member.user_id === currentMembership.user_id && (
                    <p className="text-xs text-blue-700">Personaliza tu perfil visible</p>
                  )}
                </div>
              </button>

              {canAdmin && canChangeMemberRole(member) ? (
                <select
                  value={member.role}
                  onChange={(event) => handleRoleChange(member, event.target.value as DespachoRole)}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  {getAssignableRoles(member).map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <Shield className="w-4 h-4" />
                  {roleLabels[member.role]}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-blue-100 rounded-md shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-blue-700" />
          <h3 className="font-semibold text-slate-950">Código diario para añadir despacho</h3>
        </div>

        {canAdmin ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Código vigente
              </p>
              <code className="mt-1 block text-blue-950 font-semibold tracking-wide">
                {currentCode || 'Genera el código de hoy'}
              </code>
              <p className="mt-1 text-xs text-blue-800">
                Entra como solo lectura - {formatInviteExpiration(currentCodeExpiresAt)}
              </p>
            </div>
            <button
              onClick={handleGenerateCode}
              className="px-4 py-2 bg-blue-700 text-white rounded-md text-sm font-medium hover:bg-blue-800"
            >
              Generar código de hoy
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Solo propietario o administrador puede generar invitaciones.
          </p>
        )}

        {currentCode && (
          <div className="mt-4 flex items-center gap-3 rounded-md bg-blue-50 border border-blue-100 px-4 py-3">
            <code className="text-blue-900 font-semibold tracking-wide">{currentCode}</code>
            <button
              onClick={handleCopyCode}
              className="ml-auto inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900"
            >
              <Copy className="w-4 h-4" />
              {copiedCode ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {invitations.slice(0, 5).map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between text-sm text-slate-600">
              <span>{invitation.codigo}</span>
              <span>Solo lectura - {invitation.usos} uso(s)</span>
            </div>
          ))}
        </div>
      </section>

      </div>
      </SettingsPanel>
      </div>

      {profileTarget && (
        <div className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/60 px-4 py-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-md bg-white shadow-2xl animate-soft-fade">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <div
                className="h-11 w-11 rounded-full text-white flex items-center justify-center font-semibold overflow-hidden"
                style={{ backgroundColor: profileForm.profile_color }}
              >
                {profileForm.avatar_url ? (
                  <img src={profileForm.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  getMemberDisplayName(profileTarget).slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-950">Perfil visible</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {roleLabels[profileTarget.role]} - {profileTarget.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileTarget(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isOwnProfile ? (
              <form onSubmit={handleSaveProfile} className="px-5 py-4 space-y-4">
                <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Vista previa
                  </p>
                  <p className="mt-1 font-semibold" style={{ color: profileForm.profile_color }}>
                    {profileForm.display_name.trim() || getGenericMemberName(profileTarget)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre visible
                  </label>
                  <input
                    value={profileForm.display_name}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, display_name: event.target.value })
                    }
                    maxLength={60}
                    placeholder={getGenericMemberName(profileTarget)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Palette className="w-4 h-4 text-blue-700" />
                    <label className="text-sm font-medium text-slate-700">Color del nombre</label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {profileColorOptions.map((color) => (
                      <button
                        type="button"
                        key={color}
                        onClick={() => setProfileForm({ ...profileForm, profile_color: color })}
                        className={`h-9 w-9 rounded-md border-2 ${
                          profileForm.profile_color === color ? 'border-slate-950' : 'border-white'
                        } shadow-sm`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <input
                      type="color"
                      value={profileForm.profile_color}
                      onChange={(event) =>
                        setProfileForm({ ...profileForm, profile_color: event.target.value.toUpperCase() })
                      }
                      className="h-9 w-12 cursor-pointer rounded-md border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Imagen de perfil
                  </label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100">
                    {uploadingAvatar ? (
                      <>
                        <Camera className="w-4 h-4 animate-pulse" />
                        Subiendo imagen...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Subir PNG, JPG o WEBP
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingAvatar}
                      onChange={(event) => handleAvatarUpload(event.target.files?.[0])}
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">Máximo 2 MB.</p>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setProfileTarget(null)}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile || uploadingAvatar}
                    className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {savingProfile ? 'Guardando...' : 'Guardar perfil'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="px-5 py-4 space-y-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nombre visible
                  </p>
                  <p className="mt-1 font-semibold" style={{ color: getMemberColor(profileTarget) }}>
                    {profileTargetName || getGenericMemberName(profileTarget)}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  Cada colaborador configura su propia imagen, nombre visible y color.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
