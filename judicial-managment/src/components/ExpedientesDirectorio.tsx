import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarClock, FileText, RefreshCw, Search } from 'lucide-react';
import { supabase, type Expediente } from '../lib/supabase';

interface ExpedientesDirectorioProps {
  despachoId: string;
  mode: 'total' | 'archivo';
  canEdit?: boolean;
  onOpenExpedientes?: () => void;
  refreshToken?: number;
}

const formatDateTime = (dateValue?: string | null) => {
  if (!dateValue) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

export default function ExpedientesDirectorio({
  despachoId,
  mode,
  canEdit = false,
  onOpenExpedientes,
  refreshToken = 0,
}: ExpedientesDirectorioProps) {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const isArchivo = mode === 'archivo';

  const fetchExpedientes = useCallback(async () => {
    let query = supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('updated_at', { ascending: false });

    if (isArchivo) {
      query = query.eq('estatus', 'Archivado');
    }

    const { data, error } = await query;

    if (error) {
      setMessage(error.message);
      return;
    }

    setExpedientes((data ?? []) as Expediente[]);
  }, [despachoId, isArchivo]);

  useEffect(() => {
    fetchExpedientes();
  }, [fetchExpedientes, refreshToken]);

  const filteredExpedientes = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const sorted = [...expedientes].sort((a, b) => {
      const updatedA = new Date(a.updated_at ?? a.created_at).getTime();
      const updatedB = new Date(b.updated_at ?? b.created_at).getTime();
      if (updatedA !== updatedB) return updatedB - updatedA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    if (!term) return sorted;

    return sorted.filter((expediente) => {
      return (
        expediente.numero_expediente.toLowerCase().includes(term) ||
        expediente.partes.toLowerCase().includes(term) ||
        expediente.juzgado.toLowerCase().includes(term) ||
        expediente.estatus.toLowerCase().includes(term) ||
        (expediente.tipo_juicio ?? '').toLowerCase().includes(term)
      );
    });
  }, [expedientes, searchTerm]);

  const restoreExpediente = async (expedienteId: string) => {
    setUpdatingId(expedienteId);
    setMessage('');

    const { error } = await supabase
      .from('expedientes')
      .update({
        estatus: 'Activo',
        updated_at: new Date().toISOString(),
      })
      .eq('id', expedienteId)
      .eq('despacho_id', despachoId);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Expediente restaurado a Activo.');
      fetchExpedientes();
    }

    setUpdatingId('');
  };

  const Icon = isArchivo ? Archive : FileText;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md text-blue-700">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">
              {isArchivo ? 'Archivo' : 'Total de Expedientes'}
            </h2>
            <p className="text-sm text-slate-500">
              {isArchivo
                ? 'Expedientes con estatus Archivado.'
                : 'Expedientes ordenados por ingreso y ultima modificacion.'}
            </p>
          </div>
        </div>

        {onOpenExpedientes && (
          <button
            onClick={onOpenExpedientes}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
          >
            <FileText className="w-4 h-4" />
            Ir a Expedientes
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <div className="bg-white rounded-md shadow-sm border border-blue-100">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar expediente, partes, juzgado o estatus..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredExpedientes.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {isArchivo
                ? 'Aun no hay expedientes archivados.'
                : 'No hay expedientes para mostrar.'}
            </div>
          ) : (
            filteredExpedientes.map((expediente) => (
              <article key={expediente.id} className="p-5 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">
                        {expediente.numero_expediente}
                      </h3>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                        {expediente.estatus}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{expediente.partes}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {expediente.juzgado}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {expediente.tipo_juicio ?? 'Tipo de juicio no definido'}
                    </p>
                  </div>

                  <div className="grid min-w-72 grid-cols-1 gap-2 text-sm text-slate-600">
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <CalendarClock className="w-4 h-4" />
                        Fecha de ingreso
                      </div>
                      <p className="mt-1 text-slate-900">{formatDateTime(expediente.created_at)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <RefreshCw className="w-4 h-4" />
                        Ultima modificacion
                      </div>
                      <p className="mt-1 text-slate-900">
                        {formatDateTime(expediente.updated_at ?? expediente.created_at)}
                      </p>
                    </div>
                    {isArchivo && canEdit && (
                      <button
                        onClick={() => restoreExpediente(expediente.id)}
                        disabled={updatingId === expediente.id}
                        className="rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
                      >
                        {updatingId === expediente.id ? 'Restaurando...' : 'Restaurar a Activo'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
