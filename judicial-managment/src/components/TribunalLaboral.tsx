import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderOpen,
  Landmark,
  Plus,
  Search,
} from 'lucide-react';
import {
  supabase,
  type LaboralAsunto,
  type LaboralProcedimiento,
  type LaboralSeccion,
} from '../lib/supabase';

interface TribunalLaboralProps {
  despachoId: string;
  canEdit: boolean;
  refreshToken?: number;
}

interface LaboralSectionConfig {
  id: LaboralSeccion;
  title: string;
  subtitle: string;
}

type HojaConciliacionValue = 'si' | 'no';

const laboralSections: LaboralSectionConfig[] = [
  {
    id: 'conciliacion',
    title: 'Conciliacion',
    subtitle: 'Etapa previa al juicio: partes, fecha y hoja de conciliacion.',
  },
  {
    id: 'junta_local',
    title: 'Junta Local de Conciliacion y Arbitraje',
    subtitle: 'Expedientes laborales de rezago o tramite ante junta local.',
  },
  {
    id: 'tribunal_laboral',
    title: 'Tribunal Laboral',
    subtitle: 'Expedientes ante tribunal laboral con procedimiento normal o especial.',
  },
];

const sectionLabels = laboralSections.reduce<Record<LaboralSeccion, string>>((labels, section) => {
  labels[section.id] = section.title;
  return labels;
}, {
  conciliacion: 'Conciliacion',
  junta_local: 'Junta Local de Conciliacion y Arbitraje',
  tribunal_laboral: 'Tribunal Laboral',
});

const emptyFormForSection = (seccion: LaboralSeccion) => ({
  seccion,
  numero_expediente: '',
  partes: '',
  procedimiento: 'normal' as LaboralProcedimiento,
  fecha_conciliacion: '',
  hoja_conciliacion: 'no' as HojaConciliacionValue,
  estatus: 'Activo',
  notas: '',
});

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
};

const getStatusClass = (estatus: string) => {
  if (estatus === 'Activo') return 'bg-blue-100 text-blue-800';
  if (estatus === 'En tramite') return 'bg-sky-100 text-sky-800';
  if (estatus === 'Suspendido') return 'bg-slate-100 text-slate-800';
  if (estatus === 'Concluido') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-200 text-slate-800';
};

export default function TribunalLaboralComponent({ despachoId, canEdit, refreshToken = 0 }: TribunalLaboralProps) {
  const [asuntos, setAsuntos] = useState<LaboralAsunto[]>([]);
  const [selectedSection, setSelectedSection] = useState<LaboralSeccion | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState(emptyFormForSection('conciliacion'));

  const fetchAsuntos = useCallback(async () => {
    const { data, error } = await supabase
      .from('laboral_asuntos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAsuntos((data ?? []) as LaboralAsunto[]);
  }, [despachoId]);

  useEffect(() => {
    fetchAsuntos();
  }, [fetchAsuntos, refreshToken]);

  const visibleAsuntos = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return asuntos.filter((asunto) => {
      const matchesSection = !selectedSection || asunto.seccion === selectedSection;
      const matchesTerm = !term || (
        asunto.partes.toLowerCase().includes(term) ||
        (asunto.numero_expediente ?? '').toLowerCase().includes(term) ||
        (asunto.procedimiento ?? '').toLowerCase().includes(term) ||
        asunto.estatus.toLowerCase().includes(term) ||
        asunto.notas.toLowerCase().includes(term)
      );

      return matchesSection && matchesTerm;
    });
  }, [asuntos, searchTerm, selectedSection]);

  const sectionStats = useMemo(() => {
    return laboralSections.map((section) => ({
      ...section,
      asuntos: asuntos.filter((asunto) => asunto.seccion === section.id).length,
    }));
  }, [asuntos]);

  const handleSelectSection = (section: LaboralSeccion) => {
    setSelectedSection(section);
    setFormData(emptyFormForSection(section));
    setShowForm(false);
    setExpandedId(null);
  };

  const handleOpenForm = () => {
    const section = selectedSection ?? 'conciliacion';
    if (!selectedSection) setSelectedSection(section);
    setFormData(emptyFormForSection(section));
    setShowForm((current) => !current);
  };

  const handleBack = () => {
    setSelectedSection(null);
    setShowForm(false);
    setExpandedId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    const isConciliacion = formData.seccion === 'conciliacion';
    const payload = isConciliacion
      ? {
        despacho_id: despachoId,
        seccion: formData.seccion,
        partes: formData.partes.trim(),
        fecha_conciliacion: formData.fecha_conciliacion || null,
        hoja_conciliacion: formData.hoja_conciliacion === 'si',
        estatus: formData.estatus,
        notas: formData.notas.trim(),
      }
      : {
        despacho_id: despachoId,
        seccion: formData.seccion,
        numero_expediente: formData.numero_expediente.trim(),
        partes: formData.partes.trim(),
        procedimiento: formData.procedimiento,
        estatus: formData.estatus,
        notas: formData.notas.trim(),
      };

    const { error } = await supabase.from('laboral_asuntos').insert([payload]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSelectedSection(formData.seccion);
    setFormData(emptyFormForSection(formData.seccion));
    setShowForm(false);
    fetchAsuntos();
  };

  const selectedConfig = selectedSection
    ? laboralSections.find((section) => section.id === selectedSection)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md">
            <Landmark className="w-6 h-6 text-blue-700" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Laboral</h2>
            <p className="text-sm text-slate-500">
              {selectedConfig?.title ?? 'Elige conciliacion, junta local o tribunal laboral.'}
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={handleOpenForm}
            className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Asunto
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      {showForm && canEdit && (
        <div className="bg-white rounded-md shadow-sm p-6 border border-blue-100 animate-slide-in-up">
          <h3 className="text-lg font-semibold mb-1 text-slate-950">Nuevo Asunto Laboral</h3>
          <p className="text-sm text-slate-500 mb-4">
            {sectionLabels[formData.seccion]}
          </p>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Apartado *</label>
              <select
                value={formData.seccion}
                onChange={(e) => {
                  const nextSection = e.target.value as LaboralSeccion;
                  setFormData(emptyFormForSection(nextSection));
                  setSelectedSection(nextSection);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {laboralSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>

            {formData.seccion !== 'conciliacion' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Número de expediente *
                </label>
                <input
                  type="text"
                  required
                  value={formData.numero_expediente}
                  onChange={(e) => setFormData({ ...formData, numero_expediente: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
            )}

            {formData.seccion !== 'conciliacion' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Procedimiento *
                </label>
                <select
                  value={formData.procedimiento}
                  onChange={(e) =>
                    setFormData({ ...formData, procedimiento: e.target.value as LaboralProcedimiento })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="normal">Normal</option>
                  <option value="especial">Especial</option>
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre de las partes *
              </label>
              <input
                type="text"
                required
                value={formData.partes}
                onChange={(e) => setFormData({ ...formData, partes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Trabajador vs Patron"
              />
            </div>

            {formData.seccion === 'conciliacion' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Fecha de conciliacion
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_conciliacion}
                    onChange={(e) => setFormData({ ...formData, fecha_conciliacion: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Hoja de conciliacion *
                  </label>
                  <select
                    value={formData.hoja_conciliacion}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        hoja_conciliacion: e.target.value as HojaConciliacionValue,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="no">No</option>
                    <option value="si">Si</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estatus *</label>
              <select
                value={formData.estatus}
                onChange={(e) => setFormData({ ...formData, estatus: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option>Activo</option>
                <option>En tramite</option>
                <option>Suspendido</option>
                <option>Concluido</option>
                <option>Archivado</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
              <textarea
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors"
              >
                Guardar Asunto
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-md shadow-sm border border-blue-100">
        <div className="p-4 border-b border-slate-200 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar partes, expediente, procedimiento o notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {selectedSection && (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
          )}
        </div>

        {!selectedSection ? (
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {sectionStats.map((section, index) => (
              <button
                key={section.id}
                onClick={() => handleSelectSection(section.id)}
                className="text-left p-5 rounded-md border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all duration-300 hover:-translate-y-1 animate-slide-in-up"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Laboral
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">{section.title}</h3>
                  </div>
                  <div className="w-11 h-11 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">{section.subtitle}</p>
                <div className="mt-5 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                  {section.asuntos} asunto(s)
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="px-5 py-4 bg-blue-50 border-y border-blue-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Apartado laboral
                </p>
                <h3 className="font-semibold text-slate-950">{selectedConfig?.title}</h3>
              </div>
              <span className="text-sm text-blue-800 bg-white border border-blue-100 px-3 py-1 rounded-full">
                {visibleAsuntos.length} asunto(s)
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {visibleAsuntos.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  No hay asuntos en este apartado.
                </div>
              )}

              {visibleAsuntos.map((asunto) => (
                <div key={asunto.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === asunto.id ? null : asunto.id)}
                    className="w-full px-6 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-950">
                            {asunto.numero_expediente ?? asunto.partes}
                          </h4>
                          <p className="text-sm text-slate-600">{asunto.partes}</p>
                          <p className="text-xs text-slate-500">
                            {asunto.seccion === 'conciliacion'
                              ? `Fecha: ${formatDate(asunto.fecha_conciliacion)}`
                              : `Procedimiento: ${asunto.procedimiento === 'especial' ? 'Especial' : 'Normal'}`}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(asunto.estatus)}`}
                        >
                          {asunto.estatus}
                        </span>
                      </div>
                    </div>
                    {expandedId === asunto.id ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </button>

                  {expandedId === asunto.id && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                      <div className="bg-white p-4 rounded-md border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-600">Apartado</p>
                          <p className="text-sm font-medium text-slate-900">{sectionLabels[asunto.seccion]}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Estatus</p>
                          <p className="text-sm font-medium text-slate-900">{asunto.estatus}</p>
                        </div>
                        {asunto.seccion === 'conciliacion' ? (
                          <>
                            <div>
                              <p className="text-xs text-slate-600">Fecha de conciliacion</p>
                              <p className="text-sm font-medium text-slate-900">
                                {formatDate(asunto.fecha_conciliacion)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600">Hoja de conciliacion</p>
                              <p className="inline-flex items-center gap-1 text-sm font-medium text-slate-900">
                                {asunto.hoja_conciliacion ? <Check className="w-4 h-4 text-emerald-700" /> : null}
                                {asunto.hoja_conciliacion ? 'Si' : 'No'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <p className="text-xs text-slate-600">Número de expediente</p>
                              <p className="text-sm font-medium text-slate-900">
                                {asunto.numero_expediente}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600">Procedimiento</p>
                              <p className="text-sm font-medium text-slate-900">
                                {asunto.procedimiento === 'especial' ? 'Especial' : 'Normal'}
                              </p>
                            </div>
                          </>
                        )}
                        <div className="md:col-span-2">
                          <p className="text-xs text-slate-600">Partes</p>
                          <p className="text-sm font-medium text-slate-900">{asunto.partes}</p>
                        </div>
                        {asunto.notas && (
                          <div className="md:col-span-2">
                            <p className="text-xs text-slate-600">Notas</p>
                            <p className="text-sm text-slate-900 whitespace-pre-wrap">{asunto.notas}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
