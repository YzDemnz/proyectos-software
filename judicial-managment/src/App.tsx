import { getCloudAIStatus } from './web/cloudAI';
import WebWorkspace from './web/WebWorkspace';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  Cpu,
  CreditCard,
  ExternalLink,
  FileCheck,
  FilePenLine,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  subscribeWorkspaceMutations,
  supabase,
  type AppProfile,
  type Despacho,
  type DespachoMember,
} from './lib/supabase';
import { checkPlatformAdminAccess } from './lib/adminData';
import { exchangeOAuthCodeFromUrl } from './lib/authSecurity';
import { runCalendarNotificationCheck } from './lib/calendarNotifications';
import Dashboard from './components/Dashboard';
import DespachosGate from './web/WebOnboarding';
import { WebLogin as Login } from './web/WebEntry';
import JurisStartup from './components/JurisStartup';
import appIconUrl from '../assets/icons/icon.png';
import type { EscribaImportRequest } from './components/Escriba';
import type { EscribaAttachmentRequest } from './lib/documentAttachments';
import PremiumFeatureNotice from './components/PremiumFeatureNotice';
import GlobalSearch from './components/GlobalSearch';
import { RegionalLocationDialog } from './components/RegionalLocationDialog';
import { hasPremiumAccess, openPremiumCheckout, shouldShowPremiumUpgradeNotice } from './lib/subscription';
import { getRegionalProfile } from './data/regionalCourts';
import {
  EMPTY_REGIONAL_CONTEXT,
  loadRegionalContext,
  saveRegionalContext,
  type RegionalLocationContext,
} from './lib/regionalLocation';
import {
  findInstalledJurisAIProfile,
  isJurisAIEnabled,
  JURIS_AI_CUSTOM_MODEL_KEY,
  JURIS_AI_MODEL_KEY,
  JURIS_AI_PROMPTED_KEY,
  JURIS_AI_VERSION,
  pickInstalledOllamaModelName,
  setJurisAIEnabled,
} from './lib/jurisAI';

const AdminShell = lazy(() => import('./components/admin/AdminShell'));
const Calendario = lazy(() => import('./components/Calendario'));
const Clientes = lazy(() => import('./components/Clientes'));
const Configuracion = lazy(() => import('./components/Configuracion'));
const DespachoChat = lazy(() => import('./components/DespachoChat'));
const Escriba = lazy(() => import('./components/Escriba'));
const Expedientes = lazy(() => import('./components/Expedientes'));
const ExpedientesDirectorio = lazy(() => import('./components/ExpedientesDirectorio'));
const JurisAI = lazy(() => import('./web/WebJurisAI'));
const JurisBot = lazy(() => import('./components/JurisBot'));
const Movimientos = lazy(() => import('./components/Movimientos'));
const ReportCenter = lazy(() => import('./components/ReportCenter'));
const TribunalLaboral = lazy(() => import('./components/TribunalLaboral'));

type Section =
  | 'dashboard'
  | 'juris'
  | 'totalExpedientes'
  | 'expedientes'
  | 'archivo'
  | 'escriba'
  | 'movimientos'
  | 'calendario'
  | 'chatDespacho'
  | 'clientes'
  | 'reportes'
  | 'tribunal'
  | 'configuracion';

const FREE_TRIAL_DAYS = 30;
const USAGE_TRACK_INTERVAL_MS = 60 * 1000;
const OLLAMA_READY_NOTICE_KEY = 'jm-ollama-ready-notice';
const MAC_QUICK_LINKS = [
  {
    label: 'PJF',
    name: 'Poder Judicial de la Federacion',
    url: 'https://www.pjf.gob.mx/',
  },
  {
    label: 'Poder en Linea',
    name: 'Poder Judicial de Coahuila',
    url: 'https://poderenlinea.gob.mx/',
  },
  {
    label: 'SCJN',
    name: 'Suprema Corte de Justicia de la Nacion',
    url: 'https://www.scjn.gob.mx/',
  },
];

const waitFor = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const getBrowserWindowPresentation = (): WindowPresentation => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspectRatio = width / Math.max(height, 1);
  const displayMode = width < 1100 || height < 700
    ? 'compact'
    : width >= 1800 && aspectRatio >= 1.85
      ? 'ultrawide'
      : width >= 1560
        ? 'wide'
        : 'standard';

  return {
    fullScreen: Boolean(document.fullscreenElement),
    maximized: false,
    width,
    height,
    displayWidth: window.screen.width,
    displayHeight: window.screen.height,
    workAreaWidth: window.screen.availWidth,
    workAreaHeight: window.screen.availHeight,
    scaleFactor: window.devicePixelRatio || 1,
    displayMode,
  };
};

function ModuleLoading() {
  return (
    <div className="flex min-h-[280px] items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>Cargando modulo...</span>
    </div>
  );
}

const WORKSPACE_REFRESH_INTERVAL_MS = 180_000;
const WORKSPACE_TABLES = new Set([
  'calendario_eventos',
  'cliente_movimientos',
  'clientes',
  'despacho_chat_adjuntos',
  'despacho_chat_mensajes',
  'despacho_invitaciones',
  'despacho_miembros',
  'despachos',
  'document_adjuntos',
  'escriba_documentos',
  'escriba_versiones',
  'expedientes',
  'juris_preferencias',
  'juris_referencias',
  'laboral_asuntos',
  'movimientos',
  'support_reports',
]);

type StartupProgress = {
  progress: number;
  status: string;
  detail: string;
};

const INITIAL_STARTUP_PROGRESS: StartupProgress = {
  progress: 8,
  status: 'Cargando archivos principales de la aplicacion.',
  detail: 'Iniciando entorno local',
};

const defaultActiveProfile = (userId: string, email: string, createdAt: string): AppProfile => ({
  id: userId,
  email,
  account_status: 'active',
  subscription_status: 'trial',
  trial_started_at: createdAt,
  trial_ends_at: createdAt ? new Date(new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString() : null,
  usage_seconds: 0,
});

const getAccountRestriction = (profile: AppProfile | null) => {
  if (!profile) return null;
  if (profile.account_status === 'disabled') return 'disabled';
  if (profile.account_status !== 'banned') return null;
  if (!profile.ban_until) return 'banned';

  const banUntil = new Date(profile.ban_until).getTime();
  if (Number.isNaN(banUntil)) return 'banned';

  return banUntil > Date.now() ? 'banned' : null;
};

function App() {
  return (
    <>
      <AppContent />
    </>
  );
}

function AppContent() {
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userCreatedAt, setUserCreatedAt] = useState('');
  const [accountProfile, setAccountProfile] = useState<AppProfile | null>(null);
  const [platformAdminAccess, setPlatformAdminAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupVisible, setStartupVisible] = useState(true);
  const [startupExiting, setStartupExiting] = useState(false);
  const [startupProgress, setStartupProgress] = useState<StartupProgress>(INITIAL_STARTUP_PROGRESS);
  const [ollamaState, setOllamaState] = useState<OllamaState | null>(null);
  const [ollamaReadyNoticeOpen, setOllamaReadyNoticeOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<DespachoMember | null>(null);
  const [escribaImportRequest, setEscribaImportRequest] = useState<EscribaImportRequest | null>(null);
  const [jurisAIEnabled, setJurisAIEnabledState] = useState(() => isJurisAIEnabled());
  const [aiUpgradeStep, setAiUpgradeStep] = useState<'intro' | 'confirm' | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeConnection, setRealtimeConnection] = useState<'idle' | 'connecting' | 'connected' | 'offline'>('idle');
  const [windowPresentation, setWindowPresentation] = useState<WindowPresentation>(() => getBrowserWindowPresentation());
  const [regionalContext, setRegionalContext] = useState<RegionalLocationContext>(EMPTY_REGIONAL_CONTEXT);
  const [regionalLocationOpen, setRegionalLocationOpen] = useState(false);
  const macSearchRef = useRef<HTMLInputElement>(null);
  const workspaceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMacVisual = (
    window.judicialDesktop?.platform === 'darwin'
    || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('platform') === 'mac')
  );
  const showMacTrafficLightPreview = window.judicialDesktop?.platform !== 'darwin';
  const premiumAccess = hasPremiumAccess(accountProfile?.subscription_status);
  const regionalProfile = getRegionalProfile(regionalContext.profileId);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('judicial-theme');
    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;
    return false;
  });

  const loadAccountProfile = useCallback(async (nextUserId: string, nextEmail: string, nextCreatedAt: string) => {
    if (!nextUserId) {
      setAccountProfile(null);
      setPlatformAdminAccess(false);
      return null;
    }

    const [profileResult, nextPlatformAdminAccess] = await Promise.all([
      supabase
        .from('app_profiles')
        .select(
          'id,email,role,account_status,subscription_status,trial_started_at,trial_ends_at,ban_until,ban_reason,disabled_reason,last_seen_at,usage_seconds,telefono,correo_alternativo,created_at,updated_at',
        )
        .eq('id', nextUserId)
        .maybeSingle(),
      checkPlatformAdminAccess(),
    ]);
    const { data, error } = profileResult;

    let nextProfile = data as AppProfile | null;

    if (error || !nextProfile) {
      const syncResult = await supabase.rpc('ensure_own_app_profile');
      nextProfile = (syncResult.data as AppProfile | null) ?? nextProfile;
    }

    if (error && !nextProfile) {
      const fallback = defaultActiveProfile(nextUserId, nextEmail, nextCreatedAt);
      setAccountProfile(fallback);
      setPlatformAdminAccess(nextPlatformAdminAccess);
      return fallback;
    }

    const safeProfile = nextProfile ?? defaultActiveProfile(nextUserId, nextEmail, nextCreatedAt);
    setAccountProfile(safeProfile);
    setPlatformAdminAccess(nextPlatformAdminAccess);
    return safeProfile;
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.classList.toggle('platform-mac', isMacVisual);
    document.documentElement.classList.toggle('platform-windows-v3', !isMacVisual);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    window.localStorage.setItem('judicial-theme', isDarkMode ? 'dark' : 'light');
    return () => {
      document.documentElement.classList.remove('platform-mac');
      document.documentElement.classList.remove('platform-windows-v3');
    };
  }, [isDarkMode, isMacVisual]);

  useEffect(() => {
    let active = true;
    const updateFromBrowser = () => {
      if (!window.judicialDesktop?.getWindowPresentation) setWindowPresentation(getBrowserWindowPresentation());
    };

    window.judicialDesktop?.getWindowPresentation?.()
      .then((presentation) => {
        if (active) setWindowPresentation(presentation);
      })
      .catch(updateFromBrowser);

    const unsubscribe = window.judicialDesktop?.onWindowPresentation?.((presentation) => {
      setWindowPresentation(presentation);
    });
    window.addEventListener('resize', updateFromBrowser);
    document.addEventListener('fullscreenchange', updateFromBrowser);

    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('resize', updateFromBrowser);
      document.removeEventListener('fullscreenchange', updateFromBrowser);
    };
  }, []);

  useEffect(() => {
    const updateRealtimeStatus = () => {
      if (!isAuthenticated || !selectedMembership) {
        setRealtimeConnection('idle');
        return;
      }

      if (!navigator.onLine) {
        setRealtimeConnection('offline');
        return;
      }

      const state = String(supabase.realtime.connectionState()).toLowerCase();
      if (state.includes('open') || state.includes('connected')) {
        setRealtimeConnection('connected');
      } else if (state.includes('connect')) {
        setRealtimeConnection('connecting');
      } else {
        setRealtimeConnection(supabase.getChannels().length > 0 ? 'offline' : 'idle');
      }
    };

    updateRealtimeStatus();
    const interval = window.setInterval(updateRealtimeStatus, 4_000);
    window.addEventListener('online', updateRealtimeStatus);
    window.addEventListener('offline', updateRealtimeStatus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', updateRealtimeStatus);
      window.removeEventListener('offline', updateRealtimeStatus);
    };
  }, [isAuthenticated, selectedMembership]);

  useEffect(() => {
    const despachoId = selectedMembership?.despacho_id;
    if (!isAuthenticated || !despachoId) return undefined;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    let refreshDebounceTimer: number | null = null;

    const requestVisibleRefresh = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      if (refreshDebounceTimer) window.clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = window.setTimeout(() => {
        refreshDebounceTimer = null;
        setRefreshRevision((current) => current + 1);
      }, 600);
    };

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      setRealtimeConnection(navigator.onLine ? 'connecting' : 'offline');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        subscribeToWorkspace();
      }, 1_500);
    };

    const subscribeToWorkspace = () => {
      if (disposed) return;

      const previousChannel = workspaceChannelRef.current;
      if (previousChannel) {
        workspaceChannelRef.current = null;
        void supabase.removeChannel(previousChannel);
      }

      setRealtimeConnection(navigator.onLine ? 'connecting' : 'offline');
      supabase.realtime.connect();

      const channel = supabase
        .channel(`workspace-sync:${despachoId}`, {
          config: {
            broadcast: { ack: true, self: false },
          },
        })
        .on('broadcast', { event: 'workspace-invalidated' }, (event) => {
          const signal = event.payload as { despachoId?: string; table?: string } | null;
          if (signal?.despachoId !== despachoId) return;
          if (signal.table && !WORKSPACE_TABLES.has(signal.table)) return;
          requestVisibleRefresh();
        })
;
      for (const table of ['expedientes', 'clientes', 'movimientos', 'calendario_eventos', 'laboral_asuntos', 'despacho_miembros', 'despacho_chat_mensajes', 'document_adjuntos', 'escriba_documentos', 'juris_referencias', 'juris_preferencias']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `despacho_id=eq.${despachoId}` }, requestVisibleRefresh);
      }
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'despachos', filter: `id=eq.${despachoId}` }, requestVisibleRefresh)
        .subscribe((status) => {
          if (disposed) return;
          if (status === 'SUBSCRIBED') {
            clearReconnectTimer();
            setRealtimeConnection('connected');
            requestVisibleRefresh();
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            scheduleReconnect();
          }
        });

      workspaceChannelRef.current = channel;
    };

    const restoreConnection = () => {
      if (!navigator.onLine) {
        setRealtimeConnection('offline');
        return;
      }
      requestVisibleRefresh();
      if (workspaceChannelRef.current?.state !== 'joined') subscribeToWorkspace();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') restoreConnection();
    };

    const unsubscribeMutations = subscribeWorkspaceMutations(({ table }) => {
      if (disposed || !WORKSPACE_TABLES.has(table)) return;
      requestVisibleRefresh();
      void workspaceChannelRef.current?.send({
        type: 'broadcast',
        event: 'workspace-invalidated',
        payload: { despachoId, table },
      });
    });

    subscribeToWorkspace();
    refreshTimer = window.setInterval(() => { if (workspaceChannelRef.current?.state !== 'joined') requestVisibleRefresh(); }, WORKSPACE_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', restoreConnection);
    window.addEventListener('online', restoreConnection);
    window.addEventListener('offline', restoreConnection);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (refreshDebounceTimer) window.clearTimeout(refreshDebounceTimer);
      window.removeEventListener('focus', restoreConnection);
      window.removeEventListener('online', restoreConnection);
      window.removeEventListener('offline', restoreConnection);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeMutations();
      if (workspaceChannelRef.current) {
        const channel = workspaceChannelRef.current;
        workspaceChannelRef.current = null;
        void supabase.removeChannel(channel);
      }
    };
  }, [isAuthenticated, selectedMembership?.despacho_id]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('es-MX') === 'k') {
        event.preventDefault();
        macSearchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const startedAt = Date.now();
      const updateStartup = (nextProgress: StartupProgress) => {
        if (active) setStartupProgress(nextProgress);
      };

      updateStartup({
        progress: 18,
        status: 'Revisando archivos locales y configuracion de la app.',
        detail: 'Archivos de escritorio',
      });

      try {
        updateStartup({
          progress: 34,
          status: 'Revisando si hay una sesion segura guardada.',
          detail: 'Sesion y autenticacion',
        });

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user?.email) {
          updateStartup({
            progress: 52,
            status: 'Conectando con Supabase y validando tu perfil.',
            detail: 'Conexion segura',
          });
          setUserId(session.user.id);
          setUserEmail(session.user.email);
          setUserCreatedAt(session.user.created_at);
          await loadAccountProfile(session.user.id, session.user.email, session.user.created_at);
          supabase.realtime.connect();
          updateStartup({
            progress: 74,
            status: 'Preparando la sincronizacion del despacho.',
            detail: 'Datos en tiempo real',
          });
          updateStartup({
            progress: 92,
            status: 'Preparando tu despacho para trabajar.',
            detail: 'Interfaz lista',
          });
          setIsAuthenticated(true);
        } else {
          updateStartup({
            progress: 82,
            status: 'Preparando el acceso seguro para iniciar sesion.',
            detail: 'Pantalla de acceso',
          });
        }
      } catch (error) {
        updateStartup({
          progress: 72,
          status: 'Restableciendo el arranque local de forma segura.',
          detail: 'Recuperando inicio',
        });
        const message = error instanceof Error ? error.message : String(error);
        const isInvalidStoredSession = /refresh token|invalid token|session.*not found/i.test(message);

        if (isInvalidStoredSession) {
          Object.keys(window.localStorage)
            .filter((key) => /^sb-[a-z0-9]+-auth-token$/i.test(key))
            .forEach((key) => window.localStorage.removeItem(key));
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }

        setUserId('');
        setUserEmail('');
        setUserCreatedAt('');
        setAccountProfile(null);
        setPlatformAdminAccess(false);
        setSelectedMembership(null);
        setIsAuthenticated(false);
        window.judicialDesktop?.reportRendererError?.({
          source: 'session-bootstrap',
          message,
        });
      } finally {
        updateStartup({
          progress: 100,
          status: 'Listo. Abriendo Judicial Managment.',
          detail: 'Despacho listo',
        });
        const remainingIntro = Math.max(0, 650 - (Date.now() - startedAt));
        await waitFor(remainingIntro);
        if (active) {
          setLoading(false);
          await waitFor(40);
          if (active) {
            setStartupExiting(true);
            await waitFor(360);
            if (active) setStartupVisible(false);
          }
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        setUserId(session.user.id);
        setUserEmail(session.user.email);
        setUserCreatedAt(session.user.created_at);
        window.setTimeout(() => { void loadAccountProfile(session.user.id, session.user.email!, session.user.created_at).catch(() => undefined); }, 0);
        setIsAuthenticated(true);
      } else {
        setUserId('');
        setUserEmail('');
        setUserCreatedAt('');
        setAccountProfile(null);
        setPlatformAdminAccess(false);
        setIsAuthenticated(false);
        setSelectedMembership(null);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadAccountProfile]);

  useEffect(() => {
    const unsubscribe = window.judicialDesktop?.onAuthCallback?.((url) => {
      exchangeOAuthCodeFromUrl(url).catch(() => undefined);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let mounted = true;

    getCloudAIStatus().then(status => ({ status: status.configured ? 'ready' : 'not-installed', installed: status.configured, running: status.configured, ready: status.configured, version: status.model, executablePath: null, models: status.configured ? [status.model] : [], checkedAt: new Date().toISOString(), message: status.configured ? 'Servicio de IA conectado.' : 'El administrador debe configurar la IA.' } as OllamaState))
      .then((state) => {
        if (mounted) setOllamaState(state);
      })
      .catch(() => undefined);

    const unsubscribe = window.judicialDesktop?.onOllamaStatus?.((state) => {
      setOllamaState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!selectedMembership) return;

    runCalendarNotificationCheck(selectedMembership.despacho_id).catch(() => undefined);
    const interval = window.setInterval(() => {
      runCalendarNotificationCheck(selectedMembership.despacho_id).catch(() => undefined);
    }, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [selectedMembership]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !userEmail) return;

    const refreshProfile = () => {
      if (document.visibilityState !== 'visible') return;
      loadAccountProfile(userId, userEmail, userCreatedAt).catch(() => undefined);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshProfile();
    };

    const interval = window.setInterval(refreshProfile, 300_000);
    window.addEventListener('focus', refreshProfile);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshProfile);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAuthenticated, loadAccountProfile, userCreatedAt, userEmail, userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setRegionalContext(EMPTY_REGIONAL_CONTEXT);
      setRegionalLocationOpen(false);
      return;
    }

    const storedContext = loadRegionalContext(userId);
    if (storedContext) {
      setRegionalContext(storedContext);
      setRegionalLocationOpen(false);
      return;
    }

    setRegionalContext(EMPTY_REGIONAL_CONTEXT);
    setRegionalLocationOpen(false);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (!isAuthenticated || getAccountRestriction(accountProfile)) return;

    const reportUsage = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        await supabase.rpc('track_app_usage', { delta_seconds: Math.round(USAGE_TRACK_INTERVAL_MS / 1000) });
      })().catch(() => undefined);
    };

    const interval = window.setInterval(reportUsage, USAGE_TRACK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [accountProfile, isAuthenticated]);

  useEffect(() => {
    if (!premiumAccess || !isAuthenticated || loading || getAccountRestriction(accountProfile)) {
      setAiUpgradeStep(null);
      return;
    }
    if (ollamaState?.status === 'ready') return;
    if (window.localStorage.getItem(JURIS_AI_PROMPTED_KEY) === 'true') return;

    // Web activation is offered in Juris, without a desktop installation modal.
  }, [accountProfile, isAuthenticated, loading, ollamaState?.status, premiumAccess]);

  useEffect(() => {
    if (!premiumAccess || !isAuthenticated || loading || !selectedMembership || ollamaState?.status !== 'ready') {
      setOllamaReadyNoticeOpen(false);
      return;
    }

    const signature = [
      ollamaState.version ?? 'unknown',
      [...ollamaState.models].sort().join(','),
    ].join('|');
    if (window.localStorage.getItem(OLLAMA_READY_NOTICE_KEY) === signature) return;

    setAiUpgradeStep(null);
    setOllamaReadyNoticeOpen(false);
  }, [isAuthenticated, loading, ollamaState, premiumAccess, selectedMembership]);

  useEffect(() => {
    if (premiumAccess || activeSection !== 'escriba') return;
    setActiveSection('dashboard');
    setEscribaImportRequest(null);
  }, [activeSection, premiumAccess]);

  const updateJurisAIEnabled = (enabled: boolean) => {
    setJurisAIEnabled(enabled);
    setJurisAIEnabledState(enabled);
  };

  const closeAIUpgradePrompt = () => {
    window.localStorage.setItem(JURIS_AI_PROMPTED_KEY, 'true');
    setAiUpgradeStep(null);
  };

  const activateJurisAIFromPrompt = () => {
    updateJurisAIEnabled(true);
    window.localStorage.setItem(JURIS_AI_PROMPTED_KEY, 'true');
    setAiUpgradeStep(null);
    setActiveSection('juris');
  };

  const closeOllamaReadyNotice = () => {
    if (ollamaState?.status === 'ready') {
      const signature = [
        ollamaState.version ?? 'unknown',
        [...ollamaState.models].sort().join(','),
      ].join('|');
      window.localStorage.setItem(OLLAMA_READY_NOTICE_KEY, signature);
    }
    setOllamaReadyNoticeOpen(false);
  };

  const activateJurisFromOllamaNotice = () => {
    const installedModels = ollamaState?.models ?? [];
    const installedProfile = findInstalledJurisAIProfile(installedModels);
    if (installedProfile) {
      window.localStorage.setItem(JURIS_AI_MODEL_KEY, installedProfile.id);
      window.localStorage.removeItem(JURIS_AI_CUSTOM_MODEL_KEY);
    } else {
      const detectedModel = pickInstalledOllamaModelName(installedModels);
      if (detectedModel) {
        window.localStorage.setItem(JURIS_AI_CUSTOM_MODEL_KEY, detectedModel);
      }
    }
    window.localStorage.setItem(JURIS_AI_PROMPTED_KEY, 'true');
    closeOllamaReadyNotice();
    updateJurisAIEnabled(true);
    setActiveSection('juris');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setIsAuthenticated(false);
    setUserId('');
    setUserEmail('');
    setUserCreatedAt('');
    setAccountProfile(null);
    setPlatformAdminAccess(false);
    setSelectedMembership(null);
    setEscribaImportRequest(null);
    setRegionalContext(EMPTY_REGIONAL_CONTEXT);
    setRegionalLocationOpen(false);
    setActiveSection('dashboard');
  };

  const handleRegionalContextSave = (nextContext: RegionalLocationContext) => {
    setRegionalContext(nextContext);
    saveRegionalContext(userId, nextContext);
    setRegionalLocationOpen(false);
  };

  const refreshCurrentInformation = () => {
    setIsRefreshing(true);
    setRefreshRevision((current) => current + 1);
    window.setTimeout(() => setIsRefreshing(false), 650);
  };

  const retryRealtimeConnection = () => {
    supabase.realtime.connect();
    refreshCurrentInformation();
  };

  const openAttachmentInEscriba = (attachment: EscribaAttachmentRequest) => {
    if (!premiumAccess) return;
    setEscribaImportRequest({
      id: `${attachment.attachmentId}-${Date.now()}`,
      url: attachment.signedUrl,
      fileName: attachment.fileName,
      expedienteId: attachment.expedienteId ?? null,
    });
    setActiveSection('escriba');
  };

  const realtimeLabel = realtimeConnection === 'connected'
    ? 'Sincronización en tiempo real activa'
    : realtimeConnection === 'connecting'
      ? 'Reconectando sincronización en tiempo real'
      : realtimeConnection === 'offline'
        ? 'Sincronización sin conexión. Haz clic para reintentar.'
        : 'Sincronización en tiempo real disponible';

  const startupOverlay = startupVisible ? (
    <JurisStartup
      exiting={startupExiting}
      progress={startupProgress.progress}
      status={startupProgress.status}
      detail={startupProgress.detail}
    />
  ) : null;

  if (loading) {
    return startupOverlay;
  }

  if (!isAuthenticated) {
    return (
      <>
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
        {startupOverlay}
      </>
    );
  }

  const accountRestriction = getAccountRestriction(accountProfile);
  if (accountRestriction) {
    return (
      <>
        <AccountRestrictionScreen
          type={accountRestriction}
          profile={accountProfile}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        {startupOverlay}
      </>
    );
  }

  if (platformAdminAccess) {
    return (
      <>
        <Suspense fallback={<ModuleLoading />}>
          <AdminShell userEmail={userEmail} onLogout={handleLogout} />
        </Suspense>
        {startupOverlay}
      </>
    );
  }

  if (!selectedMembership) {
    return (
      <>
        <DespachosGate
          userId={userId}
          userEmail={userEmail}
          onSelectDespacho={(membership) => {
            setSelectedMembership(membership);
            setActiveSection('dashboard');
          }}
        />
        {startupOverlay}
      </>
    );
  }

  const selectedDespacho = selectedMembership.despacho as Despacho;
  const canEditDespacho = selectedMembership.role !== 'viewer';
  const windowPresentationClass = `screen-${windowPresentation.displayMode}${windowPresentation.fullScreen ? ' is-fullscreen' : ''}${windowPresentation.maximized ? ' is-maximized' : ''}`;

  const navigation = [
    { id: 'dashboard' as Section, name: 'Panel de Control', icon: LayoutDashboard },
    { id: 'expedientes' as Section, name: 'Expedientes', icon: FileText },
    { id: 'movimientos' as Section, name: 'Movimientos', icon: FileCheck },
    { id: 'calendario' as Section, name: 'Calendario', icon: CalendarDays },
    ...(premiumAccess ? [{ id: 'escriba' as Section, name: 'Escriba', icon: FilePenLine }] : []),
    { id: 'clientes' as Section, name: 'Clientes', icon: Users },
    { id: 'tribunal' as Section, name: 'Laboral', icon: Landmark },
    { id: 'configuracion' as Section, name: 'Configuración', icon: Settings },
  ];

  const activeSectionName = (
    navigation.find((item) => item.id === activeSection)?.name
    ?? {
      juris: 'Juris',
      totalExpedientes: 'Total de Expedientes',
      archivo: 'Archivo',
      chatDespacho: 'Chat del Despacho',
      reportes: 'Chat de Reportes',
    }[activeSection as 'juris' | 'totalExpedientes' | 'archivo' | 'chatDespacho' | 'reportes']
    ?? 'Judicial Managment'
  );
  const roleLabel = selectedMembership.role === 'owner'
    ? 'Propietario'
    : selectedMembership.role === 'admin'
      ? 'Administrador'
      : selectedMembership.role === 'editor'
        ? 'Colaborador'
        : 'Solo lectura';

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard despachoId={selectedDespacho.id} currentUserId={userId} ollamaState={premiumAccess ? ollamaState : null} premiumAccess={premiumAccess} onNavigate={setActiveSection} refreshToken={refreshRevision} />;
      case 'juris':
        return premiumAccess ? (
          <JurisAI
            aiEnabled={jurisAIEnabled}
            despachoId={selectedDespacho.id}
            despachoName={selectedDespacho.nombre}
            canEdit={canEditDespacho}
            onAIEnabledChange={updateJurisAIEnabled}
            onNavigate={(section) => setActiveSection(section)}
          />
        ) : (
          <JurisBot onNavigate={(section) => setActiveSection(section)} />
        );
      case 'totalExpedientes':
        return (
          <ExpedientesDirectorio
            despachoId={selectedDespacho.id}
            mode="total"
            refreshToken={refreshRevision}
            onOpenExpedientes={() => setActiveSection('expedientes')}
          />
        );
      case 'expedientes':
        return <Expedientes despachoId={selectedDespacho.id} canEdit={canEditDespacho} onOpenInEscriba={premiumAccess ? openAttachmentInEscriba : undefined} refreshToken={refreshRevision} regionalContext={regionalContext} regionalProfile={regionalProfile} onConfigureRegion={() => setRegionalLocationOpen(true)} />;
      case 'archivo':
        return (
          <ExpedientesDirectorio
            despachoId={selectedDespacho.id}
            mode="archivo"
            canEdit={canEditDespacho}
            refreshToken={refreshRevision}
            onOpenExpedientes={() => setActiveSection('expedientes')}
          />
        );
      case 'movimientos':
        return <Movimientos despachoId={selectedDespacho.id} canEdit={canEditDespacho} onOpenInEscriba={premiumAccess ? openAttachmentInEscriba : undefined} refreshToken={refreshRevision} />;
      case 'calendario':
        return <Calendario despachoId={selectedDespacho.id} refreshToken={refreshRevision} />;
      case 'chatDespacho':
        return <DespachoChat despachoId={selectedDespacho.id} />;
      case 'reportes':
        return premiumAccess ? (
          <ReportCenter
            despachoId={selectedDespacho.id}
            ollamaState={ollamaState}
            activityItems={[]}
            events={[]}
            onActivateAI={() => setActiveSection('juris')}
            refreshToken={refreshRevision}
          />
        ) : (
          <PremiumFeatureNotice
            title="Chat de reportes con Juris IA"
            description="El análisis automático de actividad y los reportes clasificados están disponibles con Premium. El chat normal del despacho sigue incluido."
            onUpgrade={() => void openPremiumCheckout()}
          />
        );
      case 'escriba':
        return premiumAccess ? (
          <Escriba
            despachoId={selectedDespacho.id}
            despachoName={selectedDespacho.nombre}
            canEdit={canEditDespacho}
            importRequest={escribaImportRequest}
            onImportRequestHandled={(requestId) => {
              setEscribaImportRequest((current) => current?.id === requestId ? null : current);
            }}
          />
        ) : (
          <PremiumFeatureNotice
            title="Escriba"
            description="El editor jurídico, su historial y la preparación de documentos forman parte de Premium."
            onUpgrade={() => void openPremiumCheckout()}
          />
        );
      case 'clientes':
        return <Clientes despachoId={selectedDespacho.id} canEdit={canEditDespacho} refreshToken={refreshRevision} />;
      case 'tribunal':
        return <TribunalLaboral despachoId={selectedDespacho.id} canEdit={canEditDespacho} refreshToken={refreshRevision} />;
      case 'configuracion':
        return <Configuracion despacho={selectedDespacho} currentMembership={selectedMembership} refreshToken={refreshRevision} premiumAccess={premiumAccess} onUpgrade={() => void openPremiumCheckout()} regionalContext={regionalContext} onConfigureRegion={() => setRegionalLocationOpen(true)} />;
      default:
        return <Dashboard despachoId={selectedDespacho.id} currentUserId={userId} ollamaState={premiumAccess ? ollamaState : null} premiumAccess={premiumAccess} onNavigate={setActiveSection} refreshToken={refreshRevision} />;
    }
  };

  const sectionContent = (
    <Suspense fallback={<ModuleLoading />}>
      {renderContent()}
    </Suspense>
  );

  const overlays = (
    <>
      {premiumAccess && aiUpgradeStep && (
        <JurisAIUpgradeModal
          step={aiUpgradeStep}
          onStart={() => setAiUpgradeStep('confirm')}
          onCancel={closeAIUpgradePrompt}
          onConfirm={activateJurisAIFromPrompt}
        />
      )}
      {premiumAccess && ollamaReadyNoticeOpen && ollamaState?.status === 'ready' && (
        <OllamaReadyModal
          state={ollamaState}
          onClose={closeOllamaReadyNotice}
          onActivate={activateJurisFromOllamaNotice}
        />
      )}
      <RegionalLocationDialog
        open={regionalLocationOpen}
        context={regionalContext}
        onClose={() => setRegionalLocationOpen(false)}
        onSave={handleRegionalContextSave}
      />
    </>
  );

  const trialNotice = (
    <PremiumUpgradeNotice
      userEmail={userEmail}
      accountCreatedAt={accountProfile?.created_at ?? userCreatedAt}
      subscriptionStatus={accountProfile?.subscription_status}
    />
  );

  if (isMacVisual) {
    return (
      <div className={`mac-app-shell ${windowPresentationClass}`} data-scale-factor={windowPresentation.scaleFactor}>
        {overlays}
        {startupOverlay}

        <aside className="mac-sidebar" aria-label="Navegacion principal">
          {showMacTrafficLightPreview && (
            <div className="mac-window-controls" aria-hidden="true">
              <span className="mac-window-control mac-window-control-close" />
              <span className="mac-window-control mac-window-control-minimize" />
              <span className="mac-window-control mac-window-control-expand" />
            </div>
          )}

          <div className="mac-sidebar-brand">
            <img src={appIconUrl} alt="" className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-slate-950 dark:text-white">
                Judicial Managment
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {selectedDespacho.nombre}
              </p>
            </div>
          </div>

          <nav className="mac-sidebar-nav">
            <p className="mac-sidebar-label">Espacio de trabajo</p>
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`mac-sidebar-item ${isActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="mac-sidebar-footer">
            <button type="button" onClick={() => setActiveSection('juris')} className="mac-center-status">
              <span className="mac-center-status-icon">
                <Bot className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold">{premiumAccess ? 'Juris IA' : 'Juris Bot'}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className={`mac-status-dot ${ollamaState?.status === 'ready' ? 'is-online' : ''}`} />
                  {premiumAccess && ollamaState?.status === 'ready' ? 'En linea' : 'Incluido'}
                </span>
              </span>
            </button>
          </div>
        </aside>

        <section className="mac-workspace">
          <header className="mac-toolbar">
            <div className="mac-toolbar-navigation" aria-label="Contexto actual">
              <span className="mac-toolbar-section-dot" />
              <span className="truncate">{activeSectionName}</span>
            </div>

            <GlobalSearch
              despachoId={selectedDespacho.id}
              inputRef={macSearchRef}
              includeEscriba={premiumAccess}
              variant="mac"
              onNavigate={(section) => setActiveSection(section)}
            />

            <div className="mac-toolbar-actions">
              <button
                type="button"
                className="mac-active-despacho"
                title="Tu despacho web"
              >
                <Building2 className="h-4 w-4" />
                <span className="truncate">{selectedDespacho.nombre}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDarkMode((current) => !current)}
                className="mac-toolbar-icon-button"
                title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                aria-label={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={refreshCurrentInformation}
                className="mac-toolbar-icon-button"
                title="Recargar información"
                aria-label="Recargar información"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={retryRealtimeConnection}
                className={`mac-toolbar-icon-button ${realtimeConnection === 'offline' ? 'text-amber-600 dark:text-amber-300' : realtimeConnection === 'connected' ? 'text-emerald-600 dark:text-emerald-300' : ''}`}
                title={realtimeLabel}
                aria-label={realtimeLabel}
              >
                {realtimeConnection === 'offline' ? <WifiOff className="h-4 w-4" /> : <Wifi className={`h-4 w-4 ${realtimeConnection === 'connecting' ? 'animate-pulse' : ''}`} />}
              </button>

              <button
                type="button"
                className="mac-toolbar-icon-button mac-notification-button"
                title="Notificaciones"
                aria-label="Notificaciones"
                onClick={() => setActiveSection('calendario')}
              >
                <Bell className="h-4 w-4" />
                <span className="mac-notification-dot" />
              </button>

              <button
                type="button"
                className="mac-user-summary"
                title={userEmail}
                onClick={() => setActiveSection('configuracion')}
              >
                <span className="mac-user-avatar">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[11px] font-semibold">{userEmail.split('@')[0]}</span>
                  <span className="block truncate text-[9px] text-slate-400">
                    {selectedMembership.role === 'owner'
                      ? 'Propietario'
                      : selectedMembership.role === 'admin'
                        ? 'Administrador'
                        : selectedMembership.role === 'editor'
                          ? 'Colaborador'
                          : 'Solo lectura'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="mac-toolbar-icon-button mac-logout-button"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="mac-main">
            {trialNotice}
            {activeSection === 'dashboard' && (
              <div className="mac-judicial-links" aria-label="Accesos judiciales">
                {MAC_QUICK_LINKS.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.name}
                    className="mac-toolbar-button"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            )}
            <div className="mac-content-surface animate-mac-content">
              {sectionContent}
            </div>
          </main>
        </section>
      </div>
    );
  }

  return (
    <WebWorkspace
      activeSection={activeSection} sectionName={activeSectionName}
      despachoId={selectedDespacho.id} despachoName={selectedDespacho.nombre}
      userName={selectedMembership.display_name?.trim() || userEmail.split('@')[0]}
      roleLabel={roleLabel} premiumAccess={premiumAccess} canEdit={canEditDespacho}
      navigation={navigation} onNavigate={setActiveSection} searchRef={macSearchRef}
      onRefresh={refreshCurrentInformation} isRefreshing={isRefreshing}
      realtime={realtimeConnection} realtimeLabel={realtimeLabel} onReconnect={retryRealtimeConnection}
      isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(current => !current)} onLogout={handleLogout}
      notice={trialNotice} overlays={<>{overlays}{startupOverlay}</>}
    >{sectionContent}</WebWorkspace>
  );
}
interface PremiumUpgradeNoticeProps {
  userEmail: string;
  accountCreatedAt: string;
  subscriptionStatus?: AppProfile['subscription_status'];
}

function OllamaReadyModal({
  state,
  onClose,
  onActivate,
}: {
  state: OllamaState;
  onClose: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/75 px-4 py-4 backdrop-blur-sm">
      <section className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-emerald-200 bg-white shadow-2xl animate-slide-in-up dark:border-emerald-900/60 dark:bg-slate-900">
        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Motor local detectado
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
                Ollama ya esta listo para Judicial
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            Judicial detecto automaticamente la instalacion de Ollama y confirmo que puede comunicarse con el motor local. Juris IA ya puede trabajar usando los recursos de esta computadora.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Versión de Ollama</span>
              </div>
              <p className="mt-2 font-semibold text-slate-950 dark:text-white">{state.version ?? 'Detectada'}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Bot className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Modelos disponibles</span>
              </div>
              <p className="mt-2 font-semibold text-slate-950 dark:text-white">{state.models.length}</p>
            </div>
          </div>

          <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Modelo local encontrado
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-blue-950 dark:text-blue-100">
              {state.models.join(', ')}
            </p>
          </div>

          {state.legacyMacOS && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Modo compatibilidad macOS {state.macOSVersion ?? '14 o anterior'}
              </p>
              <p className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">
                Debido a las limitaciones de esta versión de macOS, las siguientes funciones estarán limitadas:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                <li>Se usara un modelo ligero para evitar errores de memoria.</li>
                <li>La lectura de PDFs o escritos extensos puede tardar mas.</li>
                <li>No se ofreceran niveles Gama Media o Gama Alta en este equipo.</li>
                <li>Las herramientas de Juris dependeran del soporte real del modelo instalado.</li>
              </ol>
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Las consultas se procesan localmente mediante Ollama. Juris seguira solicitando confirmacion antes de modificar datos del despacho.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Despues
          </button>
          <button
            type="button"
            onClick={onActivate}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Bot className="h-4 w-4" />
            Activar y abrir Juris IA
          </button>
        </div>
      </section>
    </div>
  );
}

function JurisAIUpgradeModal({
  step,
  onStart,
  onCancel,
  onConfirm,
}: {
  step: 'intro' | 'confirm';
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isIntro = step === 'intro';

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-4 backdrop-blur-sm">
      <section className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-2xl animate-slide-in-up">
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-white">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Actualización disponible</p>
              <h2 className="text-xl font-bold text-slate-950">
                {isIntro ? `Versión ${JURIS_AI_VERSION} instalada` : 'Activar Juris IA'}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {isIntro ? (
            <>
              <p className="text-sm leading-relaxed text-slate-700">
                Modelos de Asistente IA local ya están disponibles para esta versión. Puedes mantener la app como está o activar Juris IA para usar modelos instalados en tu computadora.
              </p>
              <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                La IA queda desactivada hasta que tu decidas activarla.
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-700">
                Al activarlo, Juris utilizara el modelo local seleccionado para responder dentro de la aplicacion.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Para responder, Juris IA requiere Ollama y al menos un modelo local instalado.
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            {isIntro ? 'Despues' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={isIntro ? onStart : onConfirm}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            {isIntro ? 'Activar modelos IA' : 'Si, activar Juris IA'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AccountRestrictionScreen({
  type,
  profile,
  userEmail,
  onLogout,
}: {
  type: 'disabled' | 'banned';
  profile: AppProfile | null;
  userEmail: string;
  onLogout: () => Promise<void>;
}) {
  const banUntil = profile?.ban_until ? new Date(profile.ban_until) : null;
  const banDate = banUntil && !Number.isNaN(banUntil.getTime())
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'short' }).format(banUntil)
    : null;

  const title = type === 'disabled' ? 'Cuenta en validacion' : 'Cuenta en revision preventiva';
  const message = type === 'disabled'
    ? 'La cuenta ha sido desactivada de forma temporal y será reactivada una vez que sea validada la información.'
    : `Detectamos que ha infringido una de nuestras normas de uso sobre lenguaje que podria incitar al racismo, discriminacion, violencia, delitos o conductas contrarias a los terminos de uso. En lo que revisamos su cuenta se le ha impuesto un baneo temporal${banDate ? ` hasta ${banDate}` : ' de 1 dia'}.`;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center">
        <section className="w-full rounded-lg border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
          <img src={appIconUrl} alt="" className="mx-auto h-16 w-16" />
          <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full border border-red-300 bg-red-950/40 text-red-200">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-3xl font-bold">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-200">{message}</p>
          {profile?.disabled_reason && type === 'disabled' && (
            <p className="mt-4 rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              Motivo: {profile.disabled_reason}
            </p>
          )}
          {profile?.ban_reason && type === 'banned' && (
            <p className="mt-4 rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              Motivo: {profile.ban_reason}
            </p>
          )}
          <p className="mt-5 text-xs uppercase tracking-wide text-slate-400">{userEmail}</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </section>
      </div>
    </div>
  );
}

function PremiumUpgradeNotice({ userEmail, accountCreatedAt, subscriptionStatus }: PremiumUpgradeNoticeProps) {
  const dismissedKey = `judicial-premium-notice-dismissed-${userEmail.toLowerCase()}`;
  const [checkedAt] = useState(() => Date.now());
  const [dismissedAt, setDismissedAt] = useState(() => Number(window.localStorage.getItem(dismissedKey) ?? 0));

  if (!shouldShowPremiumUpgradeNotice({ accountCreatedAt, subscriptionStatus, dismissedAt, now: checkedAt })) return null;

  const handleDismiss = () => {
    const nextDismissedAt = Date.now();
    window.localStorage.setItem(dismissedKey, String(nextDismissedAt));
    setDismissedAt(nextDismissedAt);
  };

  const handleSubscribe = async () => {
    await openPremiumCheckout();
  };

  return (
    <section className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/60 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-blue-950 dark:text-blue-100">Lleva tu despacho a Premium</h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              Ya conoces Juris desde hace al menos 72 horas. Premium activa Juris IA, Escriba, el chat inteligente de reportes
              y la personalización con los formatos privados de tu despacho. Las funciones básicas continúan disponibles.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSubscribe}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            <CreditCard className="h-4 w-4" />
            Activar Premium
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-100 dark:hover:bg-slate-800"
            aria-label="Cerrar aviso de suscripcion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

export default App;
