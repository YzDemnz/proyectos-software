import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Send } from 'lucide-react';
import {
  supabase,
  type SupportReport,
  type SupportReportStatus,
} from '../lib/supabase';

const statusLabels: Record<SupportReportStatus, string> = {
  new: 'Nuevo',
  in_review: 'En revision',
  waiting_user: 'Esperando respuesta',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export default function SupportReports() {
  const [reports, setReports] = useState<SupportReport[]>([]);
  const [category, setCategory] = useState<SupportReport['category']>('otro');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReports = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('support_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (loadError) {
      if (!/support_reports/i.test(loadError.message)) setError(loadError.message);
      return;
    }

    setReports((data ?? []) as SupportReport[]);
  }, []);

  useEffect(() => {
    loadReports().catch(() => undefined);
  }, [loadReports]);

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);
    setMessage('');
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('La sesión ya no está disponible.');

      const updateState = await window.judicialDesktop?.getAppUpdateState?.().catch(() => null);
      const { error: insertError } = await supabase.from('support_reports').insert([{
        user_id: user.id,
        category,
        title: subject.trim(),
        description: description.trim(),
        steps_to_reproduce: '',
        expected_behavior: '',
        contains_sensitive_data: false,
        app_version: updateState?.currentVersion ?? null,
        platform: window.judicialDesktop?.platform ?? navigator.platform,
      }]);

      if (insertError) throw new Error(insertError.message);
      setSubject('');
      setDescription('');
      setCategory('otro');
      setMessage('Reporte enviado. Podras consultar aqui el avance de la revision.');
      await loadReports();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="rounded-md bg-blue-50 p-2 text-blue-700">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-950">Reportes y soporte</h3>
          <p className="mt-0.5 text-xs text-slate-500">Informa errores, problemas de cuenta o sugerencias.</p>
        </div>
      </div>

      <form onSubmit={submitReport} className="grid gap-4 border-b border-slate-200 p-5 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tipo de reporte</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportReport['category'])}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
          >
            <option value="error">Error de la aplicacion</option>
            <option value="cuenta">Cuenta o acceso</option>
            <option value="seguridad">Seguridad</option>
            <option value="privacidad">Privacidad</option>
            <option value="datos">Datos o documentos</option>
            <option value="actualizacion">Actualización</option>
            <option value="sugerencia">Sugerencia</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Asunto</label>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={120}
            placeholder="Resume lo que necesitas"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Describe los pasos, lo que esperabas y lo que ocurrio."
            className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="flex items-center justify-between gap-3 lg:col-span-2">
          <span className="text-xs text-slate-500">{description.length}/4000</span>
          <button
            type="submit"
            disabled={submitting || !subject.trim() || !description.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </form>

      {(message || error) && (
        <div className={`mx-5 mt-5 flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${
          error
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          {error || message}
        </div>
      )}

      <div className="p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mis reportes recientes</h4>
        {reports.length ? (
          <div className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200">
            {reports.map((report) => (
              <article key={report.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{report.title}</p>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    {statusLabels[report.status]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{report.description}</p>
                <p className="mt-2 text-xs text-slate-400">{formatDate(report.created_at)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Todavia no has enviado reportes.</p>
        )}
      </div>
    </section>
  );
}
