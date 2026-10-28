import { cloudAIFetch, getCloudEngineState } from '../../web/cloudAI';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Cpu, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { JURIS_AI_ENDPOINT } from '../../lib/jurisAI';
import type { AdminPlatformSnapshot } from '../../lib/adminData';

interface AdminAssistantProps {
  snapshot: AdminPlatformSnapshot;
}

interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

const createMessage = (role: AssistantMessage['role'], content: string): AssistantMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
});

const buildOperationalContext = (snapshot: AdminPlatformSnapshot) => {
  const activeUsers = snapshot.users.filter((user) => user.account_status === 'active').length;
  const onlineUsers = snapshot.users.filter((user) => user.online).length;
  const bannedUsers = snapshot.users.filter((user) => user.account_status === 'banned').length;
  const activeSubscriptions = snapshot.users.filter((user) => (
    user.subscription_status === 'active' || user.subscription_status === 'manual'
  )).length;
  const openReports = snapshot.reports.filter((report) => !['resolved', 'closed'].includes(report.status));
  const pendingFlags = snapshot.moderationFlags.filter((flag) => flag.status === 'pending');
  const openSecurityAlerts = snapshot.securityAlerts.filter((alert) => (
    alert.status === 'open' || alert.status === 'investigating'
  ));

  return {
    generated_at: snapshot.loadedAt,
    metrics: {
      users_total: snapshot.users.length,
      users_active: activeUsers,
      users_online_last_5_minutes: onlineUsers,
      users_banned: bannedUsers,
      despachos_active: snapshot.despachos.filter((despacho) => !despacho.deleted_at).length,
      active_subscriptions: activeSubscriptions,
      open_support_reports: openReports.length,
      pending_moderation_flags: pendingFlags.length,
      open_security_alerts: openSecurityAlerts.length,
      approved_donations_mxn: snapshot.donations
        .filter((donation) => donation.status === 'approved')
        .reduce((total, donation) => total + Number(donation.amount_mxn || 0), 0),
    },
    urgent_reports: openReports
      .filter((report) => report.priority === 'urgent' || report.priority === 'high')
      .slice(0, 12)
      .map((report) => ({
        id: report.id,
        category: report.category,
        title: report.title,
        priority: report.priority,
        status: report.status,
        created_at: report.created_at,
      })),
    pending_moderation: pendingFlags.slice(0, 12).map((flag) => ({
      id: flag.id,
      category: flag.matched_category,
      excerpt: flag.excerpt,
      created_at: flag.created_at,
    })),
    security_alerts: openSecurityAlerts.slice(0, 12).map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      status: alert.status,
      created_at: alert.created_at,
    })),
    recent_audit_events_total: snapshot.auditEvents.length,
  };
};

const buildVerifiedSummary = (context: ReturnType<typeof buildOperationalContext>) => [
  'Datos verificados por Judicial:',
  `- Usuarios registrados: ${context.metrics.users_total}`,
  `- Cuentas activas: ${context.metrics.users_active}`,
  `- Conectados en los ultimos 5 minutos: ${context.metrics.users_online_last_5_minutes}`,
  `- Despachos activos: ${context.metrics.despachos_active}`,
  `- Suscripciones activas o validadas: ${context.metrics.active_subscriptions}`,
  `- Reportes abiertos: ${context.metrics.open_support_reports}`,
  `- Alertas de moderacion pendientes: ${context.metrics.pending_moderation_flags}`,
  `- Alertas de seguridad abiertas: ${context.metrics.open_security_alerts}`,
  `- Donaciones aprobadas: $${context.metrics.approved_donations_mxn.toFixed(2)} MXN`,
].join('\n');

export default function AdminAssistant({ snapshot }: AdminAssistantProps) {
  const [ollamaState, setOllamaState] = useState<OllamaState | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    createMessage(
      'assistant',
      'Puedo resumir la operacion, priorizar reportes, detectar patrones y preparar una lista de revision. No ejecuto bloqueos ni cambios de cuenta sin tu confirmacion manual.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const operationalContext = useMemo(() => buildOperationalContext(snapshot), [snapshot]);
  const verifiedSummary = useMemo(() => buildVerifiedSummary(operationalContext), [operationalContext]);
  const selectedModel = ollamaState?.models[0] ?? 'qwen2.5:3b-instruct';

  useEffect(() => {
    getCloudEngineState()
      .then(setOllamaState)
      .catch(() => undefined);

    const unsubscribe = window.judicialDesktop?.onOllamaStatus?.(setOllamaState);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const checkOllama = async () => {
    const state = await getCloudEngineState();
    if (state) setOllamaState(state);
  };

  const sendPrompt = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || sending || ollamaState?.status !== 'ready') return;

    const userMessage = createMessage('user', prompt);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const response = await cloudAIFetch(`${JURIS_AI_ENDPOINT}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          stream: false,
          keep_alive: '30m',
          messages: [
            {
              role: 'system',
              content: [
                'Eres el asistente operativo del Centro de Administración de Judicial Managment.',
                'Analiza exclusivamente el resumen estructurado proporcionado por la aplicacion.',
                'Nunca solicites, inventes ni reveles contrasenas, tokens, documentos juridicos o contenido privado no incluido.',
                'No puedes banear usuarios, cambiar suscripciones, cerrar reportes ni modificar datos.',
                'Puedes priorizar, resumir, detectar anomalías y proponer pasos. Toda acción requiere revisión humana.',
                'Distingue claramente hechos observados, inferencias y recomendaciones.',
                'Las cifras exactas ya seran mostradas por la aplicacion antes de tu respuesta.',
                'No repitas conteos ni afirmes que todos estan conectados, activos o suscritos.',
                'Solo los reportes, alertas de moderacion y alertas de seguridad abiertas son pendientes actuales.',
                'No conviertas eventos historicos de auditoria en tareas pendientes.',
                'Concentrate en prioridades, patrones y recomendaciones basadas solamente en los datos proporcionados.',
                'Responde en espanol claro y conciso.',
                `RESUMEN OPERATIVO: ${JSON.stringify(operationalContext)}`,
              ].join('\n'),
            },
            ...nextMessages.slice(-8).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        }),
      });

      if (!response.ok) throw new Error('El servicio de IA no respondió.');
      const data = await response.json() as { message?: { content?: string } };
      const interpretation = data.message?.content?.trim() || 'El modelo no genero una interpretacion.';
      setMessages((current) => [
        ...current,
        createMessage(
          'assistant',
          `${verifiedSummary}\n\nInterpretación de Juris IA (requiere revision):\n${interpretation}`,
        ),
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        createMessage('assistant', 'No pude conectar con el servicio de IA. Revisa su configuración e intenta de nuevo.'),
      ]);
      await checkOllama().catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  const ready = ollamaState?.status === 'ready';

  return (
    <div className="grid min-h-[650px] gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-h-[650px] flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-sm">
        <div className="border-b border-slate-700 bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Asistente operativo</h2>
              <p className="text-xs text-slate-400">Análisis de plataforma mediante el servicio de IA</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[84%] rounded-md border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-700 bg-slate-800 text-slate-100'
              }`}>
                {message.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analizando el estado actual...
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-slate-700 bg-slate-950 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            sendPrompt(input).catch(() => undefined);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendPrompt(input).catch(() => undefined);
                }
              }}
              rows={2}
              maxLength={1600}
              disabled={!ready || sending}
              placeholder={ready ? 'Pide un resumen o una revision...' : 'El servicio de IA no está configurado'}
              className="min-h-11 flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!ready || sending || !input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              title="Enviar"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="rounded-md border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Servicio de IA</h3>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-300">{ollamaState?.message ?? 'Revisando servicio...'}</span>
          </div>
          {ready && (
            <p className="mt-3 break-words rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-400">
              {selectedModel}
            </p>
          )}
          <button
            type="button"
            onClick={() => checkOllama().catch(() => undefined)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Revisar motor
          </button>
        </section>

        <section className="rounded-md border border-emerald-900/70 bg-emerald-950/30 p-4">
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Control humano</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-emerald-100/80">
            El asistente recibe metricas y alertas resumidas. Las acciones administrativas se ejecutan solamente desde sus paneles y requieren confirmacion.
          </p>
        </section>

        <section className="rounded-md border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Consultas sugeridas</h3>
          <div className="mt-3 grid gap-2">
            {[
              'Dame un resumen ejecutivo de la plataforma.',
              'Que asuntos debo revisar primero hoy?',
              'Detecta patrones o riesgos en los datos actuales.',
              'Prepara una lista de seguimiento de reportes.',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={!ready || sending}
                onClick={() => sendPrompt(prompt).catch(() => undefined)}
                className="rounded-md border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:border-blue-500 hover:bg-slate-800 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Contexto procesado por el proveedor de IA configurado
        </div>
      </aside>
    </div>
  );
}
