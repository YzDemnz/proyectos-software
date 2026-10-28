import { cloudAIFetch } from '../web/cloudAI';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Send, ShieldAlert, Wrench } from 'lucide-react';
import {
  JURIS_AI_CUSTOM_MODEL_KEY,
  JURIS_AI_DEFAULT_MODEL,
  JURIS_AI_ENDPOINT,
  JURIS_AI_MODEL_KEY,
  JURIS_AI_MODELS,
  isOllamaModelMatch,
  normalizeJurisAIProfileId,
} from '../lib/jurisAI';
import {
  supabase,
  type SupportReport,
  type SupportReportPriority,
} from '../lib/supabase';

type ReportActivityType = 'movimiento' | 'expediente' | 'cliente';

interface ReportActivityItem {
  id: string;
  type: ReportActivityType;
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

interface ReportCenterProps {
  despachoId: string;
  ollamaState: OllamaState | null;
  activityItems: ReportActivityItem[];
  events: CalendarEvent[];
  onActivateAI: () => void;
  refreshToken?: number;
}

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

type ReportCategory = SupportReport['category'];

interface ReportAnalysis {
  category: ReportCategory;
  priority: SupportReportPriority;
  title: string;
  containsSensitiveData: boolean;
  assistantReply: string;
}

const categoryLabels: Record<ReportCategory, string> = {
  error: 'Error',
  sugerencia: 'Sugerencia',
  cuenta: 'Cuenta',
  seguridad: 'Seguridad',
  privacidad: 'Privacidad',
  datos: 'Datos',
  actualizacion: 'Actualización',
  otro: 'Otro',
};

const priorityLabels: Record<SupportReportPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const safeJsonParse = (value: string) => {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as Partial<ReportAnalysis>;
  } catch {
    return null;
  }
};

const normalizeText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const classifyLocally = (text: string): ReportAnalysis => {
  const normalized = normalizeText(text);
  const hasSecurity = /amenaza|racis|delito|fraude|falsific|soborn|acoso|violencia|ban|seguridad/.test(normalized);
  const hasPrivacy = /privacidad|datos personales|direccion|telefono|correo|contrasena|password|token/.test(normalized);
  const hasData = /expediente|documento|pdf|word|archivo|base de datos|movimiento|audiencia/.test(normalized);
  const hasAccount = /cuenta|login|sesion|correo|verificacion|suscripcion|pago/.test(normalized);
  const hasUpdate = /actualizacion|parche|version|instalador|descarga/.test(normalized);
  const hasError = /error|fallo|no carga|no abre|pantalla blanca|bloquea|crash|failed/.test(normalized);

  const category: ReportCategory = hasSecurity
    ? 'seguridad'
    : hasPrivacy
      ? 'privacidad'
      : hasError
        ? 'error'
        : hasAccount
          ? 'cuenta'
          : hasUpdate
            ? 'actualizacion'
            : hasData
              ? 'datos'
              : 'otro';

  const priority: SupportReportPriority = hasSecurity || /urgente|grave|critico|bloqueado|bloquea/.test(normalized)
    ? 'high'
    : hasError || hasPrivacy
      ? 'normal'
      : 'low';

  const title = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 82) || 'Reporte del despacho';

  return {
    category,
    priority,
    title: title.length >= 82 ? `${title.slice(0, 79)}...` : title,
    containsSensitiveData: hasPrivacy || /expediente|cliente|contrasena|password|token|direccion|telefono/.test(normalized),
    assistantReply: 'Voy a registrarlo, clasificarlo y enviarlo al panel de administración para revisión.',
  };
};

const getPreferredModel = (ollamaState: OllamaState | null) => {
  const customModel = window.localStorage.getItem(JURIS_AI_CUSTOM_MODEL_KEY)?.trim();
  if (customModel) return customModel;

  const savedId = normalizeJurisAIProfileId(window.localStorage.getItem(JURIS_AI_MODEL_KEY));
  const savedModel = JURIS_AI_MODELS.find((model) => model.id === savedId) ?? JURIS_AI_DEFAULT_MODEL;
  const savedInstalled = ollamaState?.models.some((name) => isOllamaModelMatch(name, savedModel.model));
  if (savedInstalled) return savedModel.model;
  return ollamaState?.models[0] ?? savedModel.model;
};

const analyzeWithOllama = async (text: string, fallback: ReportAnalysis, ollamaState: OllamaState | null) => {
  if (ollamaState?.status !== 'ready') return fallback;

  const response = await cloudAIFetch(`${JURIS_AI_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getPreferredModel(ollamaState),
      stream: false,
      keep_alive: '20m',
      messages: [
        {
          role: 'system',
          content: [
            'Clasifica reportes internos de una app juridica.',
            'Devuelve solo JSON valido.',
            'category debe ser una de: error, sugerencia, cuenta, seguridad, privacidad, datos, actualización, otro.',
            'priority debe ser una de: low, normal, high, urgent.',
            'title debe ser breve, profesional y menor de 90 caracteres.',
            'containsSensitiveData debe ser boolean.',
            'assistantReply debe confirmar que se registrará y se enviará a administración.',
            'No ejecutes sanciones ni bloqueos.',
          ].join('\n'),
        },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!response.ok) return fallback;
  const data = await response.json() as { message?: { content?: string } };
  const parsed = safeJsonParse(data.message?.content ?? '');
  if (!parsed) return fallback;

  const allowedCategories = Object.keys(categoryLabels);
  const allowedPriorities = Object.keys(priorityLabels);
  return {
    category: allowedCategories.includes(String(parsed.category)) ? parsed.category as ReportCategory : fallback.category,
    priority: allowedPriorities.includes(String(parsed.priority)) ? parsed.priority as SupportReportPriority : fallback.priority,
    title: typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 90)
      : fallback.title,
    containsSensitiveData: typeof parsed.containsSensitiveData === 'boolean'
      ? parsed.containsSensitiveData
      : fallback.containsSensitiveData,
    assistantReply: typeof parsed.assistantReply === 'string' && parsed.assistantReply.trim()
      ? parsed.assistantReply.trim()
      : fallback.assistantReply,
  };
};

const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

export default function ReportCenter({
  despachoId,
  ollamaState,
  activityItems,
  events,
  onActivateAI,
  refreshToken = 0,
}: ReportCenterProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Chat de reportes listo. Escribe el incidente, sugerencia o situación que quieras registrar.',
    },
  ]);
  const [reports, setReports] = useState<SupportReport[]>([]);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activityClock, setActivityClock] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isReady = ollamaState?.status === 'ready';

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('support_reports')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false })
      .limit(5);
    setReports((data ?? []) as SupportReport[]);
  }, [despachoId]);

  useEffect(() => {
    loadReports().catch(() => undefined);
  }, [loadReports, refreshToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, submitting]);

  useEffect(() => {
    const updateClock = () => setActivityClock(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const automaticInsight = useMemo(() => {
    const todayEvents = events.filter((event) => event.event_date === todayIso());
    const recentActivity = activityItems.filter((item) => (
      activityClock > 0 && activityClock - new Date(item.createdAt).getTime() < 60 * 60 * 1000
    ));

    if (todayEvents.length > 0) {
      return {
        signature: `today-events-${todayIso()}-${todayEvents.map((event) => event.id).join('-')}`,
        title: 'Juris detecto agenda importante para hoy',
        description: [
          'Reporte automatico del chat de reportes.',
          `Eventos detectados hoy: ${todayEvents.length}.`,
          ...todayEvents.slice(0, 4).map((event) => `- ${event.titulo}${event.event_time ? ` (${event.event_time})` : ''}`),
        ].join('\n'),
        priority: 'high' as SupportReportPriority,
      };
    }

    if (recentActivity.length >= 3) {
      return {
        signature: `recent-activity-${todayIso()}-${recentActivity.map((item) => item.id).join('-')}`,
        title: 'Juris detecto actividad alta en el despacho',
        description: [
          'Reporte automatico del chat de reportes.',
          `Actividad reciente detectada: ${recentActivity.length} registros durante la ultima hora.`,
          ...recentActivity.slice(0, 5).map((item) => `- ${item.title}: ${item.detail}`),
        ].join('\n'),
        priority: 'normal' as SupportReportPriority,
      };
    }

    return null;
  }, [activityClock, activityItems, events]);

  useEffect(() => {
    if (!isReady || !automaticInsight) return;
    const key = `jm-report-center-auto-${despachoId}-${automaticInsight.signature}`;
    if (window.localStorage.getItem(key) === 'sent') return;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updateState = await window.judicialDesktop?.getAppUpdateState?.().catch(() => null);
      const { error: insertError } = await supabase.from('support_reports').insert([{
        user_id: user.id,
        despacho_id: despachoId,
        category: 'datos',
        title: automaticInsight.title,
        description: automaticInsight.description,
        steps_to_reproduce: 'Generado automaticamente a partir de actividad reciente del despacho.',
          expected_behavior: 'Revisión manual por administración si se considera necesario.',
        contains_sensitive_data: true,
        priority: automaticInsight.priority,
        app_version: updateState?.currentVersion ?? null,
        platform: window.judicialDesktop?.platform ?? navigator.platform,
      }]);

      if (!insertError) {
        window.localStorage.setItem(key, 'sent');
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Detecté actividad relevante y dejé un reporte automático en el panel de administración.',
          },
        ]);
        loadReports().catch(() => undefined);
      }
    })();
  }, [automaticInsight, despachoId, isReady, loadReports]);

  const submitReport = async () => {
    const trimmed = input.trim();
    if (!trimmed || submitting || !isReady) return;

    setSubmitting(true);
    setError('');
    setInput('');
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: trimmed },
    ]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('La sesión ya no está disponible.');

      const fallback = classifyLocally(trimmed);
      const analysis = await analyzeWithOllama(trimmed, fallback, ollamaState).catch(() => fallback);
      const updateState = await window.judicialDesktop?.getAppUpdateState?.().catch(() => null);

      const { error: insertError } = await supabase.from('support_reports').insert([{
        user_id: user.id,
        despacho_id: despachoId,
        category: analysis.category,
        title: analysis.title,
        description: [
          'Reporte enviado desde el chat de reportes.',
          `Categoria sugerida: ${categoryLabels[analysis.category]}.`,
          `Prioridad sugerida: ${priorityLabels[analysis.priority]}.`,
          '',
          trimmed,
        ].join('\n'),
        steps_to_reproduce: '',
        expected_behavior: 'Revisión manual desde el panel de administración.',
        contains_sensitive_data: analysis.containsSensitiveData,
        priority: analysis.priority,
        app_version: updateState?.currentVersion ?? null,
        platform: window.judicialDesktop?.platform ?? navigator.platform,
      }]);

      if (insertError) throw new Error(insertError.message);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${analysis.assistantReply} Quedo como ${categoryLabels[analysis.category]} con prioridad ${priorityLabels[analysis.priority]}.`,
        },
      ]);
      await loadReports();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'No se pudo registrar el reporte.';
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `No pude registrar el reporte: ${message}`,
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitReport().catch(() => undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitReport().catch(() => undefined);
    }
  };

  if (!isReady) {
    return (
      <section className="report-center-card report-center-offline">
        <div className="report-center-header">
          <div>
            <MessageTitle />
            <p>Clasificacion y registro inteligente</p>
          </div>
          <span>No activo</span>
        </div>

        <div className="broken-bot" aria-hidden="true">
          <div className="broken-bot-antenna" />
          <div className="broken-bot-head">
            <span>x</span>
            <span>x</span>
            <i />
          </div>
          <Wrench className="broken-bot-wrench h-5 w-5" />
        </div>

        <h3>Para activar el chat de reportes en tiempo real es necesario activar la IA.</h3>
        <p>
          Cuando el servicio de IA esté configurado, este espacio registrara reportes,
          catalogará incidencias y avisará a administración si detecta actividad delicada.
        </p>

        <button type="button" onClick={onActivateAI}>
          <Bot className="h-4 w-4" />
          Activar Juris IA
        </button>
      </section>
    );
  }

  return (
    <section className="report-center-card">
      <div className="report-center-header">
        <div>
          <MessageTitle />
          <p>Reportes registrados y enviados al panel admin</p>
        </div>
        <span className="is-ready">
          <CheckCircle2 className="h-3.5 w-3.5" />
          IA activa
        </span>
      </div>

      <div className="report-center-messages">
        {messages.map((message) => (
          <article key={message.id} className={`report-center-message is-${message.role}`}>
            {message.content}
          </article>
        ))}
        {submitting && (
          <article className="report-center-message is-assistant">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Clasificando y registrando...
          </article>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="report-center-error">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <form className="report-center-form" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          placeholder="Escribe un reporte, incidente o alerta para administración..."
        />
        <button type="submit" disabled={submitting || !input.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>

      <div className="report-center-recent">
        <h4>Ultimos reportes</h4>
        {reports.length === 0 ? (
          <p>Sin reportes registrados todavia.</p>
        ) : reports.slice(0, 3).map((report) => (
          <article key={report.id}>
            <span>{categoryLabels[report.category]}</span>
            <strong>{report.title}</strong>
            <small>{formatDate(report.created_at)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function MessageTitle() {
  return (
    <h3>
      <ShieldAlert className="h-4 w-4" />
      Chat de reportes
    </h3>
  );
}
