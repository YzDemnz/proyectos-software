import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Archive, ArrowRight, Bot, CalendarDays, ChevronDown, ExternalLink, FileCheck, FileText, Landmark, MessageSquare, Settings2, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import pjfLogo from '../web/assets/pjf-panel.png';
import poderLogo from '../web/assets/poder-en-linea-logo.png';
import scjnLogo from '../web/assets/scjn-logo-color-h.svg';
interface Stats {
  expedientes: number;
  clientes: number;
  movimientos: number;
  tribunales: number;
  expedientesActivos: number;
  archivo: number;
}

interface DashboardProps {
  despachoId: string;
  currentUserId: string;
  ollamaState: OllamaState | null;
  premiumAccess: boolean;
  onNavigate: (section: DashboardTarget) => void;
  refreshToken?: number;
}

type DashboardTarget =
  | 'juris'
  | 'totalExpedientes'
  | 'expedientes'
  | 'archivo'
  | 'movimientos'
  | 'clientes'
  | 'tribunal'
  | 'calendario'
  | 'chatDespacho'
  | 'reportes';

type ReportType = 'movimiento' | 'expediente' | 'cliente';

interface ReportItem {
  id: string;
  type: ReportType;
  title: string;
  detail: string;
  createdAt: string;
}

interface CalendarEvent {
  id: string;
  titulo: string;
  descripcion: string;
  event_date: string;
  event_time: string | null;
  tipo: 'audiencia' | 'vencimiento' | 'recordatorio' | 'otro';
}

interface ChatPreviewState {
  unreadCount: number;
}

interface SupportReportPreviewState {
  count: number;
  lastReport: {
    title: string;
    description: string;
    category: string;
    created_at: string;
  } | null;
}

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatReportDate = (dateValue: string) => {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

const formatEventDay = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return { day: '--', month: '---' };
  const date = new Date(year, month - 1, day);
  return {
    day: new Intl.DateTimeFormat('es-MX', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(date).replace('.', '').toUpperCase(),
  };
};

const formatEventTime = (value: string | null) => {
  if (!value) return 'Sin hora';
  const [hour, minute] = value.split(':');
  return `${hour}:${minute}`;
};

const daysFromToday = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return '';
  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff < 0) return 'Vencido';
  return `En ${diff} días`;
};

const chatReadKey = (despachoId: string, userId: string) => `judicial-chat-read:${despachoId}:${userId}`;

export default function Dashboard({ despachoId, currentUserId, ollamaState, premiumAccess, onNavigate, refreshToken = 0 }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    expedientes: 0,
    clientes: 0,
    movimientos: 0,
    tribunales: 0,
    expedientesActivos: 0,
    archivo: 0,
  });
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [chatPreview, setChatPreview] = useState<ChatPreviewState>({ unreadCount: 0 });
  const [supportReportPreview, setSupportReportPreview] = useState<SupportReportPreviewState>({ count: 0, lastReport: null });

  const fetchDashboardData = useCallback(async () => {
    const [
      expedientes,
      clientes,
      movimientos,
      tribunales,
      activos,
      archivo,
      recentExpedientes,
      recentClientes,
      recentMovimientos,
      upcomingEvents,
      supportReports,
      lastSupportReport,
    ] = await Promise.all([
      supabase.from('expedientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('laboral_asuntos').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('expedientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId).eq('estatus', 'Activo'),
      supabase.from('expedientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId).eq('estatus', 'Archivado'),
      supabase
        .from('expedientes')
        .select('id, numero_expediente, partes, created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('clientes')
        .select('id, nombre, created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('movimientos')
        .select('id, tipo, descripcion, fecha, created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('calendario_eventos')
        .select('id,titulo,descripcion,event_date,event_time,tipo')
        .eq('despacho_id', despachoId)
        .gte('event_date', todayIso())
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(8),
      supabase.from('support_reports').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase
        .from('support_reports')
        .select('id,title,description,category,created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    setStats({
      expedientes: expedientes.count || 0,
      clientes: clientes.count || 0,
      movimientos: movimientos.count || 0,
      tribunales: tribunales.count || 0,
      expedientesActivos: activos.count || 0,
      archivo: archivo.count || 0,
    });

    const expedienteReports = ((recentExpedientes.data ?? []) as Array<{
      id: string;
      numero_expediente: string;
      partes: string;
      created_at: string;
    }>).map((expediente) => ({
      id: `expediente-${expediente.id}`,
      type: 'expediente' as const,
      title: 'Expediente agregado',
      detail: `${expediente.numero_expediente} - ${expediente.partes}`,
      createdAt: expediente.created_at,
    }));

    const clienteReports = ((recentClientes.data ?? []) as Array<{
      id: string;
      nombre: string;
      created_at: string;
    }>).map((cliente) => ({
      id: `cliente-${cliente.id}`,
      type: 'cliente' as const,
      title: 'Cliente agregado',
      detail: cliente.nombre,
      createdAt: cliente.created_at,
    }));

    const movimientoReports = ((recentMovimientos.data ?? []) as Array<{
      id: string;
      tipo: string;
      descripcion?: string;
      fecha?: string;
      created_at: string;
    }>).map((movimiento) => ({
      id: `movimiento-${movimiento.id}`,
      type: 'movimiento' as const,
      title: 'Movimiento agregado',
      detail: movimiento.descripcion
        ? `${movimiento.tipo} - ${movimiento.descripcion}`
        : movimiento.tipo,
      createdAt: movimiento.created_at ?? movimiento.fecha ?? new Date().toISOString(),
    }));

    setReports(
      [...movimientoReports, ...expedienteReports, ...clienteReports]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    );
    setEvents((upcomingEvents.data ?? []) as CalendarEvent[]);
    const readKey = currentUserId ? chatReadKey(despachoId, currentUserId) : '';
    let lastReadAt = readKey ? window.localStorage.getItem(readKey) : null;
    if (!lastReadAt && readKey) {
      lastReadAt = new Date().toISOString();
      window.localStorage.setItem(readKey, lastReadAt);
    }

    const unreadMessages = currentUserId && lastReadAt
      ? await supabase
        .from('despacho_chat_mensajes')
        .select('*', { count: 'exact', head: true })
        .eq('despacho_id', despachoId)
        .neq('sender_user_id', currentUserId)
        .gt('created_at', lastReadAt)
      : null;
    setChatPreview({ unreadCount: unreadMessages?.count || 0 });
    setSupportReportPreview({
      count: supportReports.count || 0,
      lastReport: ((lastSupportReport.data ?? []) as Array<{
        title: string;
        description: string;
        category: string;
        created_at: string;
      }>)[0] ?? null,
    });
  }, [currentUserId, despachoId]);

  useEffect(() => {
    void fetchDashboardData();
  }, [despachoId, fetchDashboardData, refreshToken]);

  const preferenceKey = `judicial-web-links:${currentUserId}:${despachoId}`;
  const [hiddenLinks, setHiddenLinks] = useState<string[]>(() => {
    try { const saved: unknown = JSON.parse(window.localStorage.getItem(preferenceKey) || '[]'); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []; } catch { return []; }
  });
  function toggleLink(id: string) {
    setHiddenLinks(previous => {
      const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
      try { window.localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Browser storage may be unavailable. */ }
      return next;
    });
  }
  const statCards = [
    { title: 'Total expedientes', value: stats.expedientes, icon: FileText, target: 'totalExpedientes' as const },
    { title: 'Expedientes activos', value: stats.expedientesActivos, icon: TrendingUp, target: 'expedientes' as const },
    { title: 'Clientes', value: stats.clientes, icon: Users, target: 'clientes' as const },
    { title: 'Movimientos', value: stats.movimientos, icon: FileCheck, target: 'movimientos' as const },
    { title: 'Asuntos laborales', value: stats.tribunales, icon: Landmark, target: 'tribunal' as const },
    { title: 'Archivo', value: stats.archivo, icon: Archive, target: 'archivo' as const },
  ];
  const quickLinks = [
    { id: 'pjf', name: 'Servicios en Línea · PJF', description: 'Portal judicial federal', url: 'https://www.serviciosenlinea.pjf.gob.mx/juicioenlinea/juicioenlinea/Home/', logo: pjfLogo, alt: 'Poder Judicial de la Federación, Portal de Servicios en Línea' },
    { id: 'poder', name: 'Poder en Línea', description: 'Poder Judicial de Coahuila', url: 'https://poderenlinea.gob.mx/', logo: poderLogo, alt: 'Poder en Línea' },
    { id: 'scjn', name: 'Suprema Corte', description: 'Consulta y servicios de la SCJN', url: 'https://www.scjn.gob.mx/', logo: scjnLogo, alt: 'Suprema Corte de Justicia de la Nación' },
  ];
  const todayEvents = useMemo(() => events.filter(event => event.event_date === todayIso()), [events]);
  const nextEvents = events.slice(0, 3);
  const activityItems = reports.slice(0, 5);

  return <div className="jm-dashboard">
    <section className="jm-quick-section" aria-labelledby="jm-quick-title">
      <div className="jm-section-heading"><h2 id="jm-quick-title">Accesos rápidos</h2>
        <details className="jm-personalize"><summary><Settings2 />Personalizar</summary><div className="jm-link-options"><strong>Mis accesos rápidos</strong><p>Elige los que quieres ver en este dispositivo.</p>{quickLinks.map(link => <label key={link.id}><input type="checkbox" checked={!hiddenLinks.includes(link.id)} onChange={() => toggleLink(link.id)} />{link.name}</label>)}</div></details>
      </div>
      <div className="jm-quick-grid">{quickLinks.filter(link => !hiddenLinks.includes(link.id)).map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className={`jm-portal jm-portal-${link.id}`} aria-label={`${link.name}, abrir en otra pestaña`}>
        <div className="jm-portal-image"><img src={link.logo} alt={link.alt} /></div><div className="jm-portal-caption"><div><h3>{link.name}</h3><p>{link.description}</p></div><ExternalLink /></div>
      </a>)}</div>
      {quickLinks.every(link => hiddenLinks.includes(link.id)) && <p className="jm-empty">Activa tus enlaces desde Personalizar.</p>}
    </section>
    <section className="jm-agenda" aria-labelledby="jm-agenda-title">
      <header className="jm-panel-heading"><CalendarDays /><h2 id="jm-agenda-title">Tu agenda</h2><span>{todayEvents.length ? `${todayEvents.length} evento${todayEvents.length === 1 ? '' : 's'} hoy` : 'Sin eventos hoy'}</span><button onClick={() => onNavigate('calendario')}>Ver calendario<ArrowRight /></button></header>
      {nextEvents.length ? <div className="jm-agenda-list">{nextEvents.map((event, index) => { const date = formatEventDay(event.event_date); return <button key={event.id} className="jm-agenda-item" onClick={() => onNavigate('calendario')}><span className="jm-event-date"><strong>{date.day}</strong><small>{date.month}</small></span><span className="jm-event-copy"><strong>{event.titulo}</strong><span>{event.descripcion || event.tipo}{event.event_time ? ` · ${formatEventTime(event.event_time)}` : ''}</span></span><span className="jm-event-tag">{index === 0 ? 'Próxima cita' : daysFromToday(event.event_date)}</span></button>; })}</div> : <div className="jm-agenda-empty"><CalendarDays /><div><strong>Tu agenda está libre</strong><p>Las próximas citas, audiencias y vencimientos aparecerán aquí.</p></div><button onClick={() => onNavigate('calendario')}>Abrir calendario<ArrowRight /></button></div>}
    </section>
    <div className="jm-folds">
      <details className="jm-fold"><summary><FileText /><h2>Resumen del despacho</h2><span>Expedientes y clientes</span><ChevronDown /></summary><div className="jm-stat-grid">{statCards.map(stat => { const Icon = stat.icon; return <button key={stat.target} onClick={() => onNavigate(stat.target)}><Icon /><strong>{stat.value}</strong><span>{stat.title}</span><ArrowRight /></button>; })}</div></details>
      <details className="jm-fold"><summary><TrendingUp /><h2>Actividad reciente</h2><span>Movimientos del despacho</span><ChevronDown /></summary><div className="jm-activity-list">{activityItems.length ? activityItems.map(item => <button key={item.id} onClick={() => onNavigate(item.type === 'expediente' ? 'expedientes' : item.type === 'cliente' ? 'clientes' : 'movimientos')}><Activity /><span><strong>{item.title}</strong><span>{item.detail}</span></span><time>{formatReportDate(item.createdAt)}</time></button>) : <p className="jm-empty">Aún no hay actividad reciente.</p>}</div></details>
      <details className="jm-fold"><summary><MessageSquare /><h2>Equipo y asistencia</h2><span>{chatPreview.unreadCount ? `${chatPreview.unreadCount} mensajes nuevos` : 'Chat del despacho y Juris'}</span><ChevronDown /></summary><div className="jm-team-grid">
        <button onClick={() => onNavigate('chatDespacho')}><MessageSquare /><span><strong>Chat del despacho</strong><small>{chatPreview.unreadCount ? `${chatPreview.unreadCount} mensajes por revisar` : 'Mensajes y archivos del equipo'}</small></span><ArrowRight /></button>
        <button onClick={() => onNavigate('juris')}><Bot /><span><strong>{premiumAccess ? 'Juris IA' : 'Juris Bot'}</strong><small>{premiumAccess ? 'Tu asistente jurídico' : 'Ayuda para usar Judicial Managment'}</small></span><ArrowRight /></button>
        <button onClick={() => onNavigate('reportes')}><ShieldAlert /><span><strong>Chat de reportes</strong><small>{!premiumAccess ? 'Disponible con Premium' : supportReportPreview.lastReport?.title || `${supportReportPreview.count} reportes · ${ollamaState?.status === 'ready' ? 'IA activa' : 'IA pendiente'}`}</small></span><ArrowRight /></button>
      </div></details>
    </div>
  </div>;
}