import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  Ban,
  BellRing,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileClock,
  FileWarning,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import appIconUrl from '../../../assets/icons/icon.png';
import {
  loadAdminPlatformSnapshot,
  loadModerationContext,
  type AdminPlatformSnapshot,
  type AdminUserRecord,
  type ModerationContextMessage,
} from '../../lib/adminData';
import {
  supabase,
  type ModerationFlag,
  type PlatformSecurityAlert,
  type SubscriptionStatus,
  type SupportReport,
  type SupportReportPriority,
  type SupportReportStatus,
} from '../../lib/supabase';
import AdminAssistant from './AdminAssistant';

type AdminSection =
  | 'overview'
  | 'users'
  | 'subscriptions'
  | 'donations'
  | 'reports'
  | 'security'
  | 'audit'
  | 'assistant';

interface AdminShellProps {
  userEmail: string;
  onLogout: () => Promise<void>;
}

interface ConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  needsReason?: boolean;
  needsDays?: boolean;
  reasonPlaceholder?: string;
  execute: (reason: string, days: number) => Promise<void>;
}

const sectionItems: Array<{
  id: AdminSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'subscriptions', label: 'Suscripciones', icon: CreditCard },
  { id: 'donations', label: 'Donaciones', icon: CircleDollarSign },
  { id: 'reports', label: 'Reportes', icon: ClipboardList },
  { id: 'security', label: 'Seguridad', icon: ShieldAlert },
  { id: 'audit', label: 'Auditoria', icon: FileClock },
  { id: 'assistant', label: 'Asistente local', icon: Bot },
];

const accountStatusLabels = {
  active: 'Activa',
  disabled: 'Desactivada',
  banned: 'Baneada',
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trial: 'Prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  manual: 'Validada manualmente',
};

const reportStatusLabels: Record<SupportReportStatus, string> = {
  new: 'Nuevo',
  in_review: 'En revision',
  waiting_user: 'Esperando usuario',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const reportPriorityLabels: Record<SupportReportPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha invalida';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatDuration = (seconds?: number | null) => {
  const totalSeconds = Math.max(0, Number(seconds ?? 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
};

const formatCurrency = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
}).format(value);

const getProfileEmail = (snapshot: AdminPlatformSnapshot, userId?: string | null) => (
  snapshot.users.find((user) => user.id === userId)?.email || 'Usuario sin correo'
);

export default function AdminShell({ userEmail, onLogout }: AdminShellProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [snapshot, setSnapshot] = useState<AdminPlatformSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmDays, setConfirmDays] = useState(1);
  const [executingAction, setExecutingAction] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<ModerationFlag | null>(null);
  const [flagContext, setFlagContext] = useState<ModerationContextMessage[]>([]);
  const [contextLoading, setContextLoading] = useState(false);

  const loadSnapshot = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      setSnapshot(await loadAdminPlatformSnapshot());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el Centro de Administración.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot().catch(() => undefined);
    const interval = window.setInterval(() => {
      loadSnapshot(true).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);

  const runConfirmedAction = async () => {
    if (!confirmAction || executingAction) return;
    setExecutingAction(true);
    setError('');

    try {
      await confirmAction.execute(confirmReason.trim(), confirmDays);
      setConfirmAction(null);
      setConfirmReason('');
      setConfirmDays(1);
      setNotice('La acción se registró correctamente en la auditoría.');
      await loadSnapshot(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo completar la acción.');
    } finally {
      setExecutingAction(false);
    }
  };

  const updateAccountStatus = (
    user: AdminUserRecord,
    status: 'active' | 'disabled' | 'banned',
  ) => {
    const descriptions = {
      active: `Se restaurara el acceso de ${user.email}.`,
      disabled: `La cuenta ${user.email} no podra entrar hasta que vuelvas a activarla.`,
      banned: `La cuenta ${user.email} quedara bloqueada temporalmente.`,
    };

    setConfirmAction({
      title: status === 'active' ? 'Reactivar cuenta' : status === 'disabled' ? 'Desactivar cuenta' : 'Aplicar baneo temporal',
      description: descriptions[status],
      confirmLabel: status === 'active' ? 'Reactivar' : status === 'disabled' ? 'Desactivar' : 'Aplicar baneo',
      danger: status !== 'active',
      needsReason: status !== 'active',
      needsDays: status === 'banned',
      reasonPlaceholder: status === 'banned'
        ? 'Describe la norma o riesgo que sera revisado'
        : 'Motivo de la desactivacion temporal',
      execute: async (reason, days) => {
        const { error: rpcError } = await supabase.rpc('admin_update_account_status', {
          target_user_id: user.id,
          new_status: status,
          reason: reason || null,
          ban_days: status === 'banned' ? days : null,
        });
        if (rpcError) throw new Error(rpcError.message);
      },
    });
  };

  const updateSubscription = (user: AdminUserRecord, status: SubscriptionStatus) => {
    setConfirmAction({
      title: 'Actualizar suscripcion',
      description: `${user.email} pasara a estado "${subscriptionLabels[status]}".`,
      confirmLabel: 'Guardar estado',
      execute: async () => {
        const { error: rpcError } = await supabase.rpc('admin_update_subscription_status', {
          target_user_id: user.id,
          new_status: status,
          provider: 'mercado_pago',
          reference: user.subscription_reference ?? null,
        });
        if (rpcError) throw new Error(rpcError.message);
      },
    });
  };

  const updateReport = (
    report: SupportReport,
    status: SupportReportStatus,
    priority: SupportReportPriority = report.priority,
  ) => {
    setConfirmAction({
      title: 'Actualizar reporte',
      description: `"${report.title}" pasara a ${reportStatusLabels[status]}.`,
      confirmLabel: 'Guardar seguimiento',
      needsReason: true,
      reasonPlaceholder: 'Nota interna de seguimiento',
      execute: async (notes) => {
        const { error: rpcError } = await supabase.rpc('admin_update_support_report', {
          report_id: report.id,
          new_status: status,
          new_priority: priority,
          reply: null,
          notes: notes || report.admin_notes || null,
        });
        if (rpcError) throw new Error(rpcError.message);
      },
    });
  };

  const updateSecurityAlert = (alert: PlatformSecurityAlert, status: PlatformSecurityAlert['status']) => {
    setConfirmAction({
      title: 'Actualizar alerta de seguridad',
      description: `"${alert.title}" pasara a estado ${status}.`,
      confirmLabel: 'Confirmar estado',
      execute: async () => {
        const { error: rpcError } = await supabase.rpc('admin_update_security_alert', {
          alert_id: alert.id,
          new_status: status,
        });
        if (rpcError) throw new Error(rpcError.message);
      },
    });
  };

  const resolveModerationFlag = (flag: ModerationFlag, resolution: 'dismissed' | 'reviewed' | 'banned') => {
    setConfirmAction({
      title: resolution === 'banned' ? 'Banear usuario por infraccion' : 'Resolver alerta de moderacion',
      description: resolution === 'banned'
        ? 'Se aplicara un baneo temporal y quedara registro de la resolucion.'
        : `La alerta quedara marcada como ${resolution === 'dismissed' ? 'descartada' : 'revisada'}.`,
      confirmLabel: resolution === 'banned' ? 'Aplicar baneo' : 'Guardar resolucion',
      danger: resolution === 'banned',
      needsReason: true,
      needsDays: resolution === 'banned',
      reasonPlaceholder: 'Notas de la revision',
      execute: async (notes, days) => {
        const { error: rpcError } = await supabase.rpc('admin_resolve_moderation_flag', {
          flag_id: flag.id,
          resolution,
          ban_days: resolution === 'banned' ? days : null,
          admin_notes: notes || null,
        });
        if (rpcError) throw new Error(rpcError.message);
        setSelectedFlag(null);
        setFlagContext([]);
      },
    });
  };

  const openModerationContext = async (flag: ModerationFlag) => {
    setSelectedFlag(flag);
    setContextLoading(true);
    setFlagContext([]);
    setError('');

    try {
      setFlagContext(await loadModerationContext(flag.id));
    } catch (contextError) {
      setError(contextError instanceof Error ? contextError.message : 'No se pudo cargar el contexto.');
    } finally {
      setContextLoading(false);
    }
  };

  const metrics = useMemo(() => {
    if (!snapshot) return null;
    return {
      users: snapshot.users.length,
      online: snapshot.users.filter((user) => user.online).length,
      banned: snapshot.users.filter((user) => user.account_status === 'banned').length,
      despachos: snapshot.despachos.filter((despacho) => !despacho.deleted_at).length,
      subscriptions: snapshot.users.filter((user) => (
        user.subscription_status === 'active' || user.subscription_status === 'manual'
      )).length,
      openReports: snapshot.reports.filter((report) => !['resolved', 'closed'].includes(report.status)).length,
      security: snapshot.securityAlerts.filter((alert) => ['open', 'investigating'].includes(alert.status)).length
        + snapshot.moderationFlags.filter((flag) => flag.status === 'pending').length,
      donations: snapshot.donations
        .filter((donation) => donation.status === 'approved')
        .reduce((total, donation) => total + Number(donation.amount_mxn || 0), 0),
    };
  }, [snapshot]);

  const filteredUsers = useMemo(() => {
    if (!snapshot) return [];
    const normalized = search.trim().toLocaleLowerCase('es-MX');
    if (!normalized) return snapshot.users;
    return snapshot.users.filter((user) => (
      user.email?.toLocaleLowerCase('es-MX').includes(normalized)
      || user.account_status?.includes(normalized)
      || user.subscription_status?.includes(normalized)
    ));
  }, [search, snapshot]);

  const renderOverview = () => {
    if (!snapshot || !metrics) return null;
    const cards = [
      { label: 'Usuarios registrados', value: metrics.users, detail: `${metrics.online} conectados recientemente`, icon: Users, tone: 'blue' },
      { label: 'Despachos activos', value: metrics.despachos, detail: 'Espacios no eliminados', icon: Building2, tone: 'cyan' },
      { label: 'Suscripciones activas', value: metrics.subscriptions, detail: 'Activas o validadas', icon: CreditCard, tone: 'emerald' },
      { label: 'Reportes abiertos', value: metrics.openReports, detail: 'Requieren seguimiento', icon: ClipboardList, tone: 'amber' },
      { label: 'Alertas pendientes', value: metrics.security, detail: 'Seguridad y moderacion', icon: ShieldAlert, tone: 'red' },
      { label: 'Donaciones aprobadas', value: formatCurrency(metrics.donations), detail: 'Acumulado registrado', icon: BadgeDollarSign, tone: 'violet' },
    ];

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const toneClasses = {
              blue: 'border-blue-900/70 bg-blue-950/30 text-blue-300',
              cyan: 'border-cyan-900/70 bg-cyan-950/30 text-cyan-300',
              emerald: 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300',
              amber: 'border-amber-900/70 bg-amber-950/30 text-amber-300',
              red: 'border-red-900/70 bg-red-950/30 text-red-300',
              violet: 'border-violet-900/70 bg-violet-950/30 text-violet-300',
            }[card.tone];

            return (
              <section key={card.label} className={`rounded-md border p-5 ${toneClasses}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                    <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
                    <p className="mt-1 text-xs opacity-75">{card.detail}</p>
                  </div>
                  <div className="rounded-md bg-slate-950/40 p-2.5">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-md border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Actividad que requiere atencion</h2>
                <p className="mt-1 text-xs text-slate-400">Reportes y alertas recientes</p>
              </div>
              <BellRing className="h-5 w-5 text-amber-400" />
            </div>
            <div className="divide-y divide-slate-800">
              {snapshot.reports.filter((report) => !['resolved', 'closed'].includes(report.status)).slice(0, 4).map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setActiveSection('reports')}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-800/70"
                >
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{report.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{reportPriorityLabels[report.priority]} - {formatDate(report.created_at)}</p>
                  </div>
                </button>
              ))}
              {snapshot.moderationFlags.filter((flag) => flag.status === 'pending').slice(0, 3).map((flag) => (
                <button
                  key={flag.id}
                  type="button"
                  onClick={() => setActiveSection('security')}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-800/70"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{flag.matched_category}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{flag.excerpt}</p>
                  </div>
                </button>
              ))}
              {metrics.openReports === 0 && metrics.security === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-500">No hay pendientes operativos.</div>
              )}
            </div>
          </section>

          <section className="rounded-md border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Usuarios recientes</h2>
                <p className="mt-1 text-xs text-slate-400">Altas y estado de acceso</p>
              </div>
              <UserCheck className="h-5 w-5 text-blue-400" />
            </div>
            <div className="divide-y divide-slate-800">
              {snapshot.users.slice(0, 7).map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setActiveSection('users')}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-800/70"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${user.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-100">{user.email}</p>
                    <p className="text-xs text-slate-500">{formatDate(user.created_at)}</p>
                  </div>
                  <StatusBadge value={user.account_status ?? 'active'} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <Panel title="Usuarios" subtitle="Cuentas, actividad y acceso a la plataforma" icon={Users}>
      <div className="border-b border-slate-700 p-4">
        <label className="relative block max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por correo o estado"
            className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white placeholder:text-slate-500"
          />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Actividad</th>
              <th className="px-4 py-3">Despachos</th>
              <th className="px-4 py-3">Colaboradores</th>
              <th className="px-4 py-3">Uso</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="text-slate-300 hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{user.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Alta: {formatDate(user.created_at)}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge value={user.account_status ?? 'active'} /></td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${user.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    {user.online ? 'Conectado' : formatDate(user.last_seen_at)}
                  </span>
                </td>
                <td className="px-4 py-3">{user.owned_despachos} propios / {user.total_memberships} total</td>
                <td className="px-4 py-3">{user.collaborators}</td>
                <td className="px-4 py-3">{formatDuration(user.usage_seconds)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {user.account_status !== 'active' && (
                      <ActionButton label="Reactivar" icon={UserCheck} onClick={() => updateAccountStatus(user, 'active')} />
                    )}
                    {user.account_status !== 'disabled' && (
                      <ActionButton label="Desactivar" icon={UserRoundX} onClick={() => updateAccountStatus(user, 'disabled')} />
                    )}
                    {user.account_status !== 'banned' && (
                      <ActionButton label="Banear" icon={Ban} danger onClick={() => updateAccountStatus(user, 'banned')} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  const renderSubscriptions = () => (
    <Panel title="Suscripciones" subtitle="Estado comercial asociado a cada cuenta" icon={CreditCard}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Prueba termina</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3 text-right">Cambiar estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {snapshot?.users.map((user) => (
              <tr key={user.id} className="text-slate-300 hover:bg-slate-800/50">
                <td className="px-4 py-3 font-medium text-white">{user.email}</td>
                <td className="px-4 py-3"><SubscriptionBadge status={user.subscription_status ?? 'trial'} /></td>
                <td className="px-4 py-3">{formatDate(user.trial_ends_at)}</td>
                <td className="px-4 py-3">{user.subscription_provider || 'Sin proveedor'}</td>
                <td className="max-w-48 truncate px-4 py-3">{user.subscription_reference || 'Sin referencia'}</td>
                <td className="px-4 py-3 text-right">
                  <select
                    value={user.subscription_status ?? 'trial'}
                    onChange={(event) => updateSubscription(user, event.target.value as SubscriptionStatus)}
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  >
                    {Object.entries(subscriptionLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  const renderDonations = () => (
    <Panel title="Donaciones" subtitle="Aportaciones registradas por la plataforma de pago" icon={CircleDollarSign}>
      {snapshot?.donations.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Donante</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Mensaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {snapshot.donations.map((donation) => (
                <tr key={donation.id} className="text-slate-300">
                  <td className="px-4 py-3 text-white">{donation.donor_email || getProfileEmail(snapshot, donation.user_id)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-300">{formatCurrency(Number(donation.amount_mxn))}</td>
                  <td className="px-4 py-3"><StatusBadge value={donation.status} /></td>
                  <td className="px-4 py-3">{donation.provider}</td>
                  <td className="px-4 py-3">{formatDate(donation.paid_at || donation.created_at)}</td>
                  <td className="max-w-xs truncate px-4 py-3">{donation.message || 'Sin mensaje'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={CircleDollarSign} title="Todavia no hay donaciones registradas" description="El panel queda listo para recibir eventos verificados del proveedor de pago." />
      )}
    </Panel>
  );

  const renderReports = () => (
    <Panel title="Reportes" subtitle="Solicitudes enviadas desde la configuración de la app" icon={ClipboardList}>
      {snapshot?.reports.length ? (
        <div className="divide-y divide-slate-800">
          {snapshot.reports.map((report) => (
            <article key={report.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={report.priority} />
                  <StatusBadge value={report.status} />
                  <span className="text-xs text-slate-500">{report.category}</span>
                </div>
                <h3 className="mt-3 font-semibold text-white">{report.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{report.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{getProfileEmail(snapshot, report.user_id)}</span>
                  <span>{formatDate(report.created_at)}</span>
                  <span>{report.platform || 'Plataforma no informada'}</span>
                  <span>{report.app_version ? `v${report.app_version}` : 'Versión no informada'}</span>
                </div>
                {report.admin_notes && (
                  <p className="mt-3 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                    Nota interna: {report.admin_notes}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <select
                  value={report.status}
                  onChange={(event) => updateReport(report, event.target.value as SupportReportStatus)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  {Object.entries(reportStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  value={report.priority}
                  onChange={(event) => updateReport(report, report.status, event.target.value as SupportReportPriority)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  {Object.entries(reportPriorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={ClipboardList} title="No hay reportes" description="Los nuevos reportes apareceran aqui para su seguimiento individual." />
      )}
    </Panel>
  );

  const renderSecurity = () => (
    <div className="space-y-5">
      <Panel title="Alertas de moderacion" subtitle="Coincidencias detectadas en el chat de equipo" icon={ShieldAlert}>
        {snapshot?.moderationFlags.length ? (
          <div className="divide-y divide-slate-800">
            {snapshot.moderationFlags.map((flag) => (
              <article key={flag.id} className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={flag.status} />
                    <span className="rounded-full bg-red-950/50 px-2 py-1 text-xs font-semibold text-red-300">{flag.matched_category}</span>
                    <span className="text-xs text-slate-500">{formatDate(flag.created_at)}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-200">{flag.excerpt}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Usuario: {getProfileEmail(snapshot, flag.user_id)} - Terminos: {flag.matched_terms.join(', ') || 'No informados'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openModerationContext(flag).catch(() => undefined)}
                  className="shrink-0 rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Revisar contexto
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Shield} title="Sin alertas de moderacion" description="No se han registrado coincidencias para revision." />
        )}
      </Panel>

      <Panel title="Alertas tecnicas" subtitle="Eventos de seguridad e integridad de la plataforma" icon={AlertTriangle}>
        {snapshot?.securityAlerts.length ? (
          <div className="divide-y divide-slate-800">
            {snapshot.securityAlerts.map((alert) => (
              <article key={alert.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_190px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={alert.severity} />
                    <StatusBadge value={alert.status} />
                    <span className="text-xs text-slate-500">{alert.source}</span>
                  </div>
                  <h3 className="mt-3 font-semibold text-white">{alert.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{alert.description}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(alert.created_at)}</p>
                </div>
                <select
                  value={alert.status}
                  onChange={(event) => updateSecurityAlert(alert, event.target.value as PlatformSecurityAlert['status'])}
                  className="h-fit rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="open">Abierta</option>
                  <option value="investigating">Investigando</option>
                  <option value="resolved">Resuelta</option>
                  <option value="dismissed">Descartada</option>
                </select>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Sin alertas tecnicas" description="No hay incidentes registrados en este momento." />
        )}
      </Panel>
    </div>
  );

  const renderAudit = () => (
    <Panel title="Auditoria" subtitle="Historial de acciones sensibles y administrativas" icon={FileClock}>
      {snapshot?.auditEvents.length ? (
        <div className="divide-y divide-slate-800">
          {snapshot.auditEvents.map((event) => (
            <article key={event.id} className="grid gap-2 px-5 py-4 md:grid-cols-[180px_1fr_220px] md:items-center">
              <div>
                <p className="text-sm font-semibold text-white">{event.action}</p>
                <p className="mt-1 text-xs text-slate-500">{event.entity}</p>
              </div>
              <pre className="overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-400">
                {JSON.stringify(event.details)}
              </pre>
              <div className="text-xs text-slate-500 md:text-right">
                <p>{getProfileEmail(snapshot, event.actor_user_id)}</p>
                <p className="mt-1">{formatDate(event.created_at)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileClock} title="Sin eventos de auditoria" description="Las acciones sensibles quedaran registradas aqui." />
      )}
    </Panel>
  );

  const renderSection = () => {
    if (!snapshot) return null;
    switch (activeSection) {
      case 'overview': return renderOverview();
      case 'users': return renderUsers();
      case 'subscriptions': return renderSubscriptions();
      case 'donations': return renderDonations();
      case 'reports': return renderReports();
      case 'security': return renderSecurity();
      case 'audit': return renderAudit();
      case 'assistant': return <AdminAssistant snapshot={snapshot} />;
      default: return renderOverview();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <img src={appIconUrl} alt="" className="mx-auto h-16 w-16 animate-pulse" />
          <p className="mt-4 text-sm text-slate-400">Cargando Centro de Administración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="flex min-h-20 items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={appIconUrl} alt="" className="h-11 w-11" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold">Judicial Managment</h1>
                <span className="rounded-full border border-blue-800 bg-blue-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-300">
                  Admin
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">{userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadSnapshot(true).catch(() => undefined)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => onLogout().catch(() => undefined)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-81px)] lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900 lg:border-b-0 lg:border-r">
          <nav className="flex gap-1 overflow-x-auto p-3 lg:sticky lg:top-0 lg:block lg:space-y-1 lg:overflow-visible lg:p-4">
            {sectionItems.map((item) => {
              const Icon = item.icon;
              const selected = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors lg:w-full ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                  {item.id === 'security' && metrics && metrics.security > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {metrics.security}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Centro de Administración</p>
              <h2 className="mt-1 text-2xl font-bold text-white">
                {sectionItems.find((item) => item.id === activeSection)?.label}
              </h2>
              {snapshot && (
                <p className="mt-1 text-xs text-slate-500">
                  Datos actualizados: {formatDate(snapshot.loadedAt)}
                </p>
              )}
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-md border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
              </div>
            )}
            {notice && (
              <div className="mb-5 flex items-start gap-3 rounded-md border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice('')} className="ml-auto"><X className="h-4 w-4" /></button>
              </div>
            )}

            {renderSection()}
          </div>
        </main>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-[90] flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm">
          <section className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-700 px-5 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                confirmAction.danger ? 'bg-red-950 text-red-300' : 'bg-blue-950 text-blue-300'
              }`}>
                {confirmAction.danger ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-white">{confirmAction.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{confirmAction.description}</p>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {confirmAction.needsReason && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Motivo o nota interna</label>
                  <textarea
                    value={confirmReason}
                    onChange={(event) => setConfirmReason(event.target.value)}
                    rows={3}
                    maxLength={800}
                    placeholder={confirmAction.reasonPlaceholder}
                    className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                  />
                </div>
              )}
              {confirmAction.needsDays && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Duracion del baneo</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={confirmDays}
                      onChange={(event) => setConfirmDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
                      className="w-24 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <span className="text-sm text-slate-400">dia(s)</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-700 bg-slate-950/60 px-5 py-4">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={executingAction}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runConfirmedAction().catch(() => undefined)}
                disabled={executingAction || (confirmAction.needsReason && !confirmReason.trim())}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirmAction.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {executingAction && <RefreshCw className="h-4 w-4 animate-spin" />}
                {confirmAction.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedFlag && snapshot && (
        <div className="fixed inset-0 z-[80] flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm">
          <section className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-700 px-5 py-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-red-400" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-white">Contexto de moderacion</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedFlag.matched_category} - {getProfileEmail(snapshot, selectedFlag.user_id)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedFlag(null)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-950/50 p-5">
              {contextLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Cargando mensajes cercanos...
                </div>
              ) : flagContext.length ? flagContext.map((message) => (
                <article
                  key={message.message_id}
                  className={`rounded-md border px-4 py-3 ${
                    message.is_flagged_message
                      ? 'border-red-700 bg-red-950/40'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-300">{getProfileEmail(snapshot, message.sender_user_id)}</span>
                    <span className="text-slate-500">{formatDate(message.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{message.body}</p>
                  {message.is_flagged_message && (
                    <span className="mt-3 inline-flex rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                      Mensaje marcado
                    </span>
                  )}
                </article>
              )) : (
                <p className="py-12 text-center text-sm text-slate-500">No hay contexto disponible.</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => resolveModerationFlag(selectedFlag, 'dismissed')}
                className="rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => resolveModerationFlag(selectedFlag, 'reviewed')}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Marcar revisada
              </button>
              <button
                type="button"
                onClick={() => resolveModerationFlag(selectedFlag, 'banned')}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Ban temporal
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-950 text-blue-300">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-slate-800 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-200">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: typeof Users;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
        danger
          ? 'border-red-900 text-red-300 hover:bg-red-950'
          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = (
    ['active', 'approved', 'resolved', 'reviewed'].includes(normalized)
      ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
      : ['banned', 'rejected', 'critical'].includes(normalized)
        ? 'border-red-900 bg-red-950/50 text-red-300'
        : ['disabled', 'pending', 'open', 'in_review', 'investigating'].includes(normalized)
          ? 'border-amber-900 bg-amber-950/50 text-amber-300'
          : 'border-slate-700 bg-slate-800 text-slate-300'
  );
  const label = accountStatusLabels[value as keyof typeof accountStatusLabels] ?? value.replace(/_/g, ' ');

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}>
      {label}
    </span>
  );
}

function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const tone = (
    status === 'active' || status === 'manual'
      ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
      : status === 'past_due'
        ? 'border-amber-900 bg-amber-950/50 text-amber-300'
        : status === 'canceled'
          ? 'border-red-900 bg-red-950/50 text-red-300'
          : 'border-blue-900 bg-blue-950/50 text-blue-300'
  );
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>{subscriptionLabels[status]}</span>;
}

function PriorityBadge({ priority }: { priority: SupportReportPriority }) {
  const tone = priority === 'urgent'
    ? 'bg-red-600 text-white'
    : priority === 'high'
      ? 'bg-amber-500 text-slate-950'
      : 'bg-slate-800 text-slate-300';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}>{reportPriorityLabels[priority]}</span>;
}

function SeverityBadge({ severity }: { severity: PlatformSecurityAlert['severity'] }) {
  const tone = severity === 'critical'
    ? 'bg-red-600 text-white'
    : severity === 'high'
      ? 'bg-orange-500 text-slate-950'
      : severity === 'medium'
        ? 'bg-amber-500 text-slate-950'
        : 'bg-blue-600 text-white';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}>{severity}</span>;
}
