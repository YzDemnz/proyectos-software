import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  supabase,
  type Cliente,
  type DocumentAttachment,
  type DocumentAttachmentTarget,
  type DespachoMember,
  type Expediente,
  type Movimiento,
} from '../lib/supabase';
import { DocumentAttachmentList, DocumentFilePicker, DocumentQuickUpload } from './DocumentAttachments';
import { createSignedDocumentUrls, uploadDocumentAttachments, type EscribaAttachmentRequest } from '../lib/documentAttachments';
import {
  createAudienceCalendarEvent,
  isAudiencia,
  movimientoTipos,
  parseMexicanDate,
  toDateInputValue,
  toMexicanDateFromDatabase,
} from '../lib/calendar';
import {
  courtSupportsMateria,
  getCourtsForProfile,
  getMateriaFromRegionalCourt,
  materiasJuzgado,
  tiposJuicioPorMateria,
  type RegionalCourt,
  type RegionalCourtProfile,
  type MateriaJuzgado,
} from '../data/regionalCourts';
import type { RegionalLocationContext } from '../lib/regionalLocation';

interface ExpedientesProps {
  despachoId: string;
  canEdit: boolean;
  onOpenInEscriba?: (request: EscribaAttachmentRequest) => void;
  refreshToken?: number;
  regionalContext: RegionalLocationContext;
  regionalProfile: RegionalCourtProfile | null;
  onConfigureRegion: () => void;
}

const defaultMateria: MateriaJuzgado = 'Mercantil';

const isMateriaJuzgado = (value?: string | null): value is MateriaJuzgado => (
  Boolean(value && materiasJuzgado.includes(value as MateriaJuzgado))
);

const getMateriaForExpediente = (
  expediente: Expediente,
  courts: RegionalCourt[],
): MateriaJuzgado | null => {
  if (isMateriaJuzgado(expediente.materia)) return expediente.materia;
  return courts.find((item) => item.nombre === expediente.juzgado)?.materia ?? null;
};

const getMateriaLabelForExpediente = (expediente: Expediente, courts: RegionalCourt[]) => (
  getMateriaForExpediente(expediente, courts)
  ?? expediente.materia?.trim()
  ?? 'Sin materia'
);

const getShortCourtName = (juzgado: RegionalCourt) => {
  if (juzgado.materia === 'Letrado') return juzgado.nombre.replace('Juzgado ', '');

  return juzgado.nombre
    .replace('Juzgado ', '')
    .replace(' de Primera Instancia en Materia', '')
    .replace(' con Especializacion Hipotecaria', ' Hipotecaria');
};

export default function Expedientes({ despachoId, canEdit, onOpenInEscriba, refreshToken = 0, regionalContext, regionalProfile, onConfigureRegion }: ExpedientesProps) {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [documentAttachments, setDocumentAttachments] = useState<DocumentAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [uploadedByNames, setUploadedByNames] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMateria, setSelectedMateria] = useState<MateriaJuzgado | null>(null);
  const [selectedJuzgado, setSelectedJuzgado] = useState<string | null>(null);
  const [expandedExpId, setExpandedExpId] = useState<string | null>(null);
  const [showMovForm, setShowMovForm] = useState<string | null>(null);
  const [editingExpedienteId, setEditingExpedienteId] = useState<string | null>(null);
  const [expedienteFiles, setExpedienteFiles] = useState<File[]>([]);
  const [newMovimientoFiles, setNewMovimientoFiles] = useState<File[]>([]);
  const [uploadingTargetId, setUploadingTargetId] = useState('');
  const [message, setMessage] = useState('');
  const [newMovimiento, setNewMovimiento] = useState({
    fecha: new Date().toISOString().split('T')[0],
    audiencia_fecha: toDateInputValue(),
    tipo: 'Audiencia',
    descripcion: '',
  });
  const [formData, setFormData] = useState({
    numero_expediente: '',
    partes: '',
    materia: defaultMateria,
    juzgado: '',
    tipo_juicio: tiposJuicioPorMateria[defaultMateria][0],
    estatus: 'Activo',
    cliente_id: '',
  });
  const [editData, setEditData] = useState(formData);
  const regionalCourts = useMemo(
    () => getCourtsForProfile(regionalProfile, regionalContext.municipality),
    [regionalContext.municipality, regionalProfile],
  );

  const fetchExpedientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setExpedientes((data ?? []) as Expediente[]);
  }, [despachoId]);

  const fetchClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('nombre');

    if (error) {
      setMessage(error.message);
      return;
    }

    setClientes((data ?? []) as Cliente[]);
  }, [despachoId]);

  const fetchMovimientos = useCallback(async () => {
    const { data, error } = await supabase
      .from('movimientos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('fecha', { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMovimientos((data ?? []) as Movimiento[]);
  }, [despachoId]);

  const fetchDocumentAttachments = useCallback(async () => {
    const { data, error } = await supabase
      .from('document_adjuntos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    const attachments = (data ?? []) as DocumentAttachment[];
    setDocumentAttachments(attachments);
    setAttachmentUrls(await createSignedDocumentUrls(attachments));
  }, [despachoId]);

  const fetchUploadedByNames = useCallback(async () => {
    const { data } = await supabase
      .from('despacho_miembros')
      .select('user_id,email,display_name')
      .eq('despacho_id', despachoId);
    const names = ((data ?? []) as Array<Pick<DespachoMember, 'user_id' | 'email' | 'display_name'>>)
      .reduce<Record<string, string>>((result, member) => {
        result[member.user_id] = member.display_name?.trim() || member.email;
        return result;
      }, {});
    setUploadedByNames(names);
  }, [despachoId]);

  useEffect(() => {
    fetchExpedientes();
    fetchClientes();
    fetchMovimientos();
    fetchDocumentAttachments();
    fetchUploadedByNames();
  }, [fetchExpedientes, fetchClientes, fetchMovimientos, fetchDocumentAttachments, fetchUploadedByNames, refreshToken]);

  const getExpedienteMovimientos = useCallback((expId: string) => {
    return movimientos.filter((movimiento) => movimiento.expediente_id === expId);
  }, [movimientos]);

  const expedienteAttachmentsById = useMemo(() => {
    return documentAttachments.reduce<Record<string, DocumentAttachment[]>>((accumulator, attachment) => {
      if (attachment.target_type === 'expediente' && attachment.expediente_id) {
        accumulator[attachment.expediente_id] = [
          ...(accumulator[attachment.expediente_id] ?? []),
          attachment,
        ];
      }

      return accumulator;
    }, {});
  }, [documentAttachments]);

  const movimientoAttachmentsById = useMemo(() => {
    return documentAttachments.reduce<Record<string, DocumentAttachment[]>>((accumulator, attachment) => {
      if (attachment.target_type === 'movimiento' && attachment.movimiento_id) {
        accumulator[attachment.movimiento_id] = [
          ...(accumulator[attachment.movimiento_id] ?? []),
          attachment,
        ];
      }

      return accumulator;
    }, {});
  }, [documentAttachments]);

  const openExpedientes = useMemo(() => {
    return expedientes.filter((expediente) => expediente.estatus !== 'Archivado');
  }, [expedientes]);

  const sortedExpedientes = useMemo(() => {
    return [...openExpedientes].sort((a, b) => {
      const movimientosA = getExpedienteMovimientos(a.id);
      const movimientosB = getExpedienteMovimientos(b.id);
      const lastA = movimientosA[0]?.fecha || a.created_at;
      const lastB = movimientosB[0]?.fecha || b.created_at;
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });
  }, [getExpedienteMovimientos, openExpedientes]);

  const searchableExpedientes = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return sortedExpedientes;

    return sortedExpedientes.filter((expediente) => {
      return (
        expediente.numero_expediente.toLowerCase().includes(term) ||
        expediente.partes.toLowerCase().includes(term) ||
        expediente.juzgado.toLowerCase().includes(term) ||
        expediente.estatus.toLowerCase().includes(term) ||
        (expediente.materia ?? '').toLowerCase().includes(term) ||
        (expediente.tipo_juicio ?? '').toLowerCase().includes(term)
      );
    });
  }, [searchTerm, sortedExpedientes]);

  const visibleExpedientes = useMemo(() => {
    return searchableExpedientes.filter((expediente) => {
      const materia = getMateriaForExpediente(expediente, regionalCourts);
      const matchesMateria = !selectedMateria || materia === selectedMateria;
      const matchesJuzgado = !selectedJuzgado || expediente.juzgado === selectedJuzgado;
      return matchesMateria && matchesJuzgado;
    });
  }, [regionalCourts, searchableExpedientes, selectedJuzgado, selectedMateria]);

  const selectedMateriaJuzgados = useMemo(() => {
    return selectedMateria
      ? regionalCourts.filter((juzgado) => courtSupportsMateria(juzgado, selectedMateria))
      : [];
  }, [regionalCourts, selectedMateria]);

  const regionalMatterOptions = useMemo(() => (
    materiasJuzgado.filter((materia) => (
      regionalCourts.some((juzgado) => courtSupportsMateria(juzgado, materia))
    ))
  ), [regionalCourts]);

  const materiaStats = useMemo(() => {
    return materiasJuzgado
      .map((materia) => ({
        materia,
        juzgados: regionalCourts.filter((juzgado) => courtSupportsMateria(juzgado, materia)).length,
        expedientes: searchableExpedientes.filter((expediente) => getMateriaForExpediente(expediente, regionalCourts) === materia).length,
      }))
      .filter((item) => item.juzgados > 0 || item.expedientes > 0);
  }, [regionalCourts, searchableExpedientes]);

  useEffect(() => {
    if (selectedMateria && !materiaStats.some((item) => item.materia === selectedMateria)) {
      setSelectedMateria(null);
      setSelectedJuzgado(null);
    }
  }, [materiaStats, selectedMateria]);

  const juzgadoStats = useMemo(() => {
    return selectedMateriaJuzgados.map((juzgado) => ({
      juzgado,
      expedientes: searchableExpedientes.filter((expediente) => expediente.juzgado === juzgado.nombre).length,
    }));
  }, [searchableExpedientes, selectedMateriaJuzgados]);

  const buildFormDefaults = (materia: MateriaJuzgado | null, juzgadoNombre: string | null) => {
    const selected = juzgadoNombre
      ? regionalCourts.find((juzgado) => juzgado.nombre === juzgadoNombre)
      : undefined;
    const selectedMateriaForCourt = selected && materia && courtSupportsMateria(selected, materia)
      ? materia
      : selected?.materia;
    const nextMateria = selectedMateriaForCourt
      ?? materia
      ?? regionalMatterOptions[0]
      ?? defaultMateria;
    const firstJuzgado = selected
      ?? regionalCourts.find((juzgado) => courtSupportsMateria(juzgado, nextMateria));

    return {
      numero_expediente: '',
      partes: '',
      materia: nextMateria,
      juzgado: firstJuzgado?.nombre ?? '',
      tipo_juicio: tiposJuicioPorMateria[nextMateria][0],
      estatus: 'Activo',
      cliente_id: '',
    };
  };

  const handleOpenForm = () => {
    setFormData(buildFormDefaults(selectedMateria, selectedJuzgado));
    setExpedienteFiles([]);
    setShowForm((current) => !current);
  };

  const handleMateriaChange = (materia: MateriaJuzgado) => {
    const firstJuzgado = regionalCourts.find((juzgado) => courtSupportsMateria(juzgado, materia));
    setFormData({
      ...formData,
      materia,
      juzgado: firstJuzgado?.nombre ?? '',
      tipo_juicio: tiposJuicioPorMateria[materia][0],
    });
  };

  const handleJuzgadoChange = (juzgadoNombre: string) => {
    if (juzgadoNombre === '__manual__') {
      setFormData({ ...formData, juzgado: '' });
      return;
    }
    const materia = getMateriaFromRegionalCourt(regionalCourts, juzgadoNombre, formData.materia);
    setFormData({
      ...formData,
      materia,
      juzgado: juzgadoNombre,
      tipo_juicio: tiposJuicioPorMateria[materia][0],
    });
  };

  const startEditExpediente = (expediente: Expediente) => {
    const materia = getMateriaForExpediente(expediente, regionalCourts) ?? defaultMateria;
    setEditData({
      numero_expediente: expediente.numero_expediente,
      partes: expediente.partes,
      materia,
      juzgado: expediente.juzgado,
      tipo_juicio: expediente.tipo_juicio ?? tiposJuicioPorMateria[materia][0],
      estatus: expediente.estatus,
      cliente_id: expediente.cliente_id ?? '',
    });
    setEditingExpedienteId(expediente.id);
  };

  const handleEditMateriaChange = (materia: MateriaJuzgado) => {
    const firstJuzgado = regionalCourts.find((juzgado) => courtSupportsMateria(juzgado, materia));
    setEditData({
      ...editData,
      materia,
      juzgado: firstJuzgado?.nombre ?? '',
      tipo_juicio: tiposJuicioPorMateria[materia][0],
    });
  };

  const handleEditJuzgadoChange = (juzgadoNombre: string) => {
    if (juzgadoNombre === '__manual__') {
      setEditData({ ...editData, juzgado: '' });
      return;
    }
    const materia = getMateriaFromRegionalCourt(regionalCourts, juzgadoNombre, editData.materia);
    setEditData({
      ...editData,
      materia,
      juzgado: juzgadoNombre,
      tipo_juicio: tiposJuicioPorMateria[materia][0],
    });
  };

  const handleUpdateExpediente = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingExpedienteId) return;

    setMessage('');
    const { error } = await supabase
      .from('expedientes')
      .update({
        ...editData,
        cliente_id: editData.cliente_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingExpedienteId)
      .eq('despacho_id', despachoId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(editData.estatus === 'Archivado'
      ? 'Expediente archivado. Ahora aparece en el modulo Archivo.'
      : 'Expediente actualizado.');
    setEditingExpedienteId(null);
    fetchExpedientes();
  };

  const handleMateriaSelect = (materia: MateriaJuzgado) => {
    setSelectedMateria(materia);
    setSelectedJuzgado(null);
    setExpandedExpId(null);
    setEditingExpedienteId(null);
  };

  const handleJuzgadoSelect = (juzgadoNombre: string) => {
    setSelectedJuzgado(juzgadoNombre);
    setExpandedExpId(null);
    setEditingExpedienteId(null);
  };

  const handleBack = () => {
    if (selectedJuzgado) {
      setSelectedJuzgado(null);
      setExpandedExpId(null);
      setEditingExpedienteId(null);
      return;
    }

    setSelectedMateria(null);
    setExpandedExpId(null);
    setEditingExpedienteId(null);
  };

  const handleExpedienteClick = (expediente: Expediente) => {
    const expedienteMovimientos = getExpedienteMovimientos(expediente.id);

    if (expedienteMovimientos.length === 0) {
      setExpandedExpId((current) => (current === expediente.id ? null : current));
      setEditingExpedienteId(null);
      return;
    }

    setExpandedExpId((current) => (current === expediente.id ? null : expediente.id));
    setEditingExpedienteId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    const payload = {
      ...formData,
      cliente_id: formData.cliente_id || null,
      despacho_id: despachoId,
    };
    const legacyPayload = {
      numero_expediente: formData.numero_expediente,
      partes: formData.partes,
      juzgado: formData.juzgado,
      estatus: formData.estatus,
      cliente_id: formData.cliente_id || null,
      despacho_id: despachoId,
    };

    const insertResponse = await supabase.from('expedientes').insert([payload]).select('id').single();
    const missingNewColumns =
      insertResponse.error?.message.includes('materia') ||
      insertResponse.error?.message.includes('tipo_juicio');
    const retry = missingNewColumns
      ? await supabase.from('expedientes').insert([legacyPayload]).select('id').single()
      : insertResponse;

    if (retry.error) {
      setMessage(retry.error.message);
      return;
    }

    if (retry.data?.id && expedienteFiles.length > 0) {
      const uploadResult = await uploadDocumentAttachments({
        despachoId,
        targetType: 'expediente',
        targetId: retry.data.id,
        files: expedienteFiles,
      });

      if (uploadResult.error) {
        setMessage(`Expediente guardado, pero no se pudieron adjuntar archivos: ${uploadResult.error}`);
      } else {
        setMessage('Expediente guardado con archivos adjuntos.');
      }
    } else {
      setMessage('Expediente guardado.');
    }

    setSelectedMateria(formData.materia as MateriaJuzgado);
    setSelectedJuzgado(formData.juzgado);
    setFormData(buildFormDefaults(formData.materia as MateriaJuzgado, formData.juzgado));
    setExpedienteFiles([]);
    setShowForm(false);
    fetchExpedientes();
    fetchDocumentAttachments();
  };

  const handleAddMovimiento = async (e: React.FormEvent, expId: string) => {
    e.preventDefault();
    setMessage('');

    const expediente = expedientes.find((item) => item.id === expId);
    const fecha = isAudiencia(newMovimiento.tipo)
      ? parseMexicanDate(newMovimiento.audiencia_fecha)
      : newMovimiento.fecha;

    if (!fecha) {
      setMessage('La fecha de audiencia debe tener el formato dd/mm/aaaa.');
      return;
    }

    const { data, error } = await supabase
      .from('movimientos')
      .insert([
        {
          expediente_id: expId,
          despacho_id: despachoId,
          fecha,
          tipo: newMovimiento.tipo,
          descripcion: newMovimiento.descripcion,
        },
      ])
      .select('id')
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    let nextMessage = 'Movimiento guardado.';

    if (isAudiencia(newMovimiento.tipo) && data?.id) {
      const { error: calendarError } = await createAudienceCalendarEvent({
        despachoId,
        expedienteId: expId,
        movimientoId: data.id,
        expedienteNumero: expediente?.numero_expediente ?? 'N/A',
        descripcion: newMovimiento.descripcion,
        fecha,
      });

      if (calendarError) {
        nextMessage = `Movimiento guardado, pero no se pudo agregar al calendario: ${calendarError.message}`;
      } else {
        nextMessage = 'Movimiento guardado y audiencia agregada al calendario.';
      }
    }

    if (data?.id && newMovimientoFiles.length > 0) {
      const uploadResult = await uploadDocumentAttachments({
        despachoId,
        targetType: 'movimiento',
        targetId: data.id,
        files: newMovimientoFiles,
      });

      if (uploadResult.error) {
        nextMessage = `${nextMessage} No se pudieron adjuntar archivos: ${uploadResult.error}`;
      } else {
        nextMessage = `${nextMessage} Archivos adjuntos guardados.`;
      }
    }

    setMessage(nextMessage);
    setNewMovimiento({
      fecha: new Date().toISOString().split('T')[0],
      audiencia_fecha: toDateInputValue(),
      tipo: 'Audiencia',
      descripcion: '',
    });
    setNewMovimientoFiles([]);
    setShowMovForm(null);
    fetchMovimientos();
    fetchExpedientes();
    fetchDocumentAttachments();
  };

  const handleDeleteMovimiento = async (movId: string) => {
    const { error } = await supabase.from('movimientos').delete().eq('id', movId);
    if (error) {
      setMessage(error.message);
      return;
    }

    fetchMovimientos();
    fetchDocumentAttachments();
  };

  const handleAttachToExisting = async (
    targetType: DocumentAttachmentTarget,
    targetId: string,
    files: File[],
  ) => {
    if (files.length === 0) return;

    setUploadingTargetId(`${targetType}-${targetId}`);
    setMessage('');

    const uploadResult = await uploadDocumentAttachments({
      despachoId,
      targetType,
      targetId,
      files,
    });

    if (uploadResult.error) {
      setMessage(uploadResult.error);
    } else {
      setMessage('Archivos adjuntos guardados.');
      fetchDocumentAttachments();
    }

    setUploadingTargetId('');
  };

  const selectedCourt = selectedJuzgado
    ? regionalCourts.find((juzgado) => juzgado.nombre === selectedJuzgado)
    : null;
  const formMatterOptions = regionalMatterOptions.length > 0
    ? regionalMatterOptions
    : materiasJuzgado;
  const editMatterOptions = formMatterOptions.includes(editData.materia)
    ? formMatterOptions
    : [...formMatterOptions, editData.materia];
  const formCourtOptions = regionalCourts.filter((juzgado) => (
    courtSupportsMateria(juzgado, formData.materia)
  ));
  const editCourtOptions = regionalCourts.filter((juzgado) => (
    courtSupportsMateria(juzgado, editData.materia)
  ));
  const formUsesManualCourt = !formCourtOptions.some((juzgado) => juzgado.nombre === formData.juzgado);
  const editUsesManualCourt = !editCourtOptions.some((juzgado) => juzgado.nombre === editData.juzgado);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md">
            <FileText className="w-6 h-6 text-blue-700" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Expedientes</h2>
            <p className="text-sm text-slate-500">
              {selectedJuzgado
                ? selectedJuzgado
                : selectedMateria
                  ? `Juzgados en materia ${selectedMateria}`
                  : 'Crea expedientes o consulta por materia y juzgado.'}
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <section className={`flex flex-col gap-3 border-y px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${regionalProfile ? 'border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20'}`}>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${regionalProfile ? 'text-blue-950 dark:text-blue-100' : 'text-amber-950 dark:text-amber-100'}`}>
            {regionalProfile ? `Catálogo regional: ${regionalProfile.label}` : 'No disponible en tu región'}
          </p>
          <p className={`mt-1 text-xs leading-5 ${regionalProfile ? 'text-blue-800 dark:text-blue-200' : 'text-amber-800 dark:text-amber-200'}`}>
            {regionalProfile
              ? `${regionalContext.municipality ? `${regionalContext.municipality}. ` : ''}${regionalProfile.coverageNote} Revisado el ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(`${regionalProfile.verifiedAt}T12:00:00`))}.`
              : 'Puedes continuar y escribir manualmente el órgano jurisdiccional.'}
          </p>
          {regionalProfile && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {regionalProfile.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-200 dark:hover:text-white">
                  {source.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onConfigureRegion} className="shrink-0 rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-100 dark:hover:bg-slate-800">Cambiar región</button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-md border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Acción principal
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Crear expediente</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Captura datos generales, juzgado, tipo de juicio, partes y documentos.
              </p>
            </div>
            {canEdit ? (
              <button
                onClick={handleOpenForm}
                className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-800"
              >
                <Plus className="w-5 h-5" />
                {showForm ? 'Cerrar formulario' : 'Crear expediente'}
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                Solo lectura
              </span>
            )}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Consulta rapida
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Materia y juzgado</h3>
          <p className="mt-2 text-sm text-slate-500">
            Revisa expedientes activos por materia y juzgado.
          </p>
        </div>
      </div>

      {showForm && canEdit && (
        <div className="bg-white rounded-md shadow-sm p-6 border border-blue-100 animate-slide-in-up">
          <h3 className="text-lg font-semibold mb-4 text-slate-950">Nuevo Expediente</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <select
                value={formData.cliente_id}
                onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="">Sin cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Partes *</label>
              <input
                type="text"
                required
                value={formData.partes}
                onChange={(e) => setFormData({ ...formData, partes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Actor vs Demandado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Materia *</label>
              <select
                value={formData.materia}
                onChange={(e) => handleMateriaChange(e.target.value as MateriaJuzgado)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {formMatterOptions.map((materia) => (
                  <option key={materia} value={materia}>
                    {materia}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Juzgado *</label>
              <select
                required
                value={formUsesManualCourt ? '__manual__' : formData.juzgado}
                onChange={(e) => handleJuzgadoChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {formCourtOptions.map((juzgado) => (
                    <option key={juzgado.id} value={juzgado.nombre}>
                      {juzgado.nombre}
                    </option>
                  ))}
                <option value="__manual__">Otro órgano jurisdiccional...</option>
              </select>
              {formUsesManualCourt && (
                <input
                  type="text"
                  required
                  value={formData.juzgado}
                  onChange={(event) => setFormData({ ...formData, juzgado: event.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="Escribe la denominación oficial completa"
                />
              )}
              <p className="mt-1 text-xs text-slate-500">Confirma la denominación en el directorio oficial antes de presentar.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de juicio *
              </label>
              <select
                value={formData.tipo_juicio}
                onChange={(e) => setFormData({ ...formData, tipo_juicio: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {tiposJuicioPorMateria[formData.materia].map((tipoJuicio) => (
                  <option key={tipoJuicio} value={tipoJuicio}>
                    {tipoJuicio}
                  </option>
                ))}
              </select>
            </div>

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
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Archivos del expediente
              </label>
              <DocumentFilePicker
                files={expedienteFiles}
                onChange={setExpedienteFiles}
                onError={setMessage}
              />
            </div>

            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setExpedienteFiles([]);
                }}
                className="px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors"
              >
                Guardar Expediente
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
              placeholder="Buscar expediente, partes, juzgado o tipo de juicio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {(selectedMateria || selectedJuzgado) && (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
          )}
        </div>

        {!selectedMateria && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {materiaStats.map((item, index) => (
              <button
                key={item.materia}
                onClick={() => handleMateriaSelect(item.materia)}
                className="text-left p-5 rounded-md border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all duration-300 hover:-translate-y-1 animate-slide-in-up"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Materia
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">{item.materia}</h3>
                  </div>
                  <div className="w-11 h-11 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-slate-500">Juzgados</p>
                    <p className="text-lg font-semibold text-slate-950">{item.juzgados}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-slate-500">Expedientes</p>
                    <p className="text-lg font-semibold text-slate-950">{item.expedientes}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedMateria && !selectedJuzgado && (
          <div className="p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-950">Juzgados de {selectedMateria}</h3>
              <p className="text-sm text-slate-500">
                Selecciona el juzgado para ver o crear expedientes dentro de el.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {juzgadoStats.map(({ juzgado, expedientes: count }, index) => (
                <button
                  key={juzgado.id}
                  onClick={() => handleJuzgadoSelect(juzgado.nombre)}
                  className="text-left p-5 rounded-md border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all duration-300 hover:-translate-y-1 animate-slide-in-up"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        {selectedMateria}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">
                        {getShortCourtName(juzgado)}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500 line-clamp-2">{juzgado.nombre}</p>
                  <div className="mt-4 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                    {count} expediente(s)
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedJuzgado && (
          <div>
            <div className="px-5 py-4 bg-blue-50 border-y border-blue-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {selectedMateria ?? selectedCourt?.materia}
                </p>
                <h3 className="font-semibold text-slate-950">{selectedJuzgado}</h3>
              </div>
              <span className="text-sm text-blue-800 bg-white border border-blue-100 px-3 py-1 rounded-full">
                {visibleExpedientes.length} expediente(s)
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {visibleExpedientes.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  No hay expedientes en este juzgado.
                </div>
              )}

              {visibleExpedientes.map((expediente) => {
                const expedienteMovimientos = getExpedienteMovimientos(expediente.id);
                const canExpand = expedienteMovimientos.length > 0;
                const isExpanded = canExpand && expandedExpId === expediente.id;
                const expedienteCliente = clientes.find((cliente) => cliente.id === expediente.cliente_id);

                return (
                <div key={expediente.id}>
                  <button
                    type="button"
                    onClick={() => handleExpedienteClick(expediente)}
                    aria-expanded={isExpanded}
                    className={`w-full px-6 py-4 transition-colors flex items-center justify-between ${
                      canExpand ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-4">
                        <div>
                          <h4 className="font-semibold text-slate-950">
                            {expediente.numero_expediente}
                          </h4>
                          <p className="text-sm text-slate-600">{expediente.partes}</p>
                          <p className="text-xs text-slate-500">
                            {expediente.tipo_juicio ?? 'Tipo de juicio no definido'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            expediente.estatus === 'Activo'
                              ? 'bg-blue-100 text-blue-800'
                              : expediente.estatus === 'En tramite'
                                ? 'bg-sky-100 text-sky-800'
                                : expediente.estatus === 'Suspendido'
                                  ? 'bg-slate-100 text-slate-800'
                                  : expediente.estatus === 'Concluido'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {expediente.estatus}
                        </span>
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          canExpand ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {expedienteMovimientos.length} movimiento(s)
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : canExpand ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Sin despliegue</span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 space-y-4">
                      <div>
                        <div className="mb-4 rounded-md border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-slate-800">Datos del expediente</h4>
                              <p className="text-xs text-slate-500">
                                Información completa del expediente seleccionado.
                              </p>
                            </div>
                            {canEdit && editingExpedienteId !== expediente.id && (
                              <button
                                type="button"
                                onClick={() => startEditExpediente(expediente)}
                                className="rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                              >
                                Modificar expediente
                              </button>
                            )}
                          </div>

                          {editingExpedienteId !== expediente.id && (
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Número</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{expediente.numero_expediente}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                  {expedienteCliente?.nombre ?? 'Sin cliente'}
                                </p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estatus</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{expediente.estatus}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Materia</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{getMateriaLabelForExpediente(expediente, regionalCourts)}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo de juicio</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                  {expediente.tipo_juicio ?? 'No definido'}
                                </p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Movimientos</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                  {expedienteMovimientos.length}
                                </p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3 md:col-span-2 xl:col-span-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Juzgado</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{expediente.juzgado}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3 md:col-span-2 xl:col-span-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Partes</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{expediente.partes}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingreso</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                  {new Date(expediente.created_at).toLocaleString('es-MX')}
                                </p>
                              </div>
                              <div className="rounded-md bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ultima modificacion</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                  {new Date(expediente.updated_at ?? expediente.created_at).toLocaleString('es-MX')}
                                </p>
                              </div>
                            </div>
                          )}

                          {editingExpedienteId === expediente.id && (
                            <form
                              onSubmit={handleUpdateExpediente}
                              className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3"
                            >
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Número de expediente *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editData.numero_expediente}
                                  onChange={(event) =>
                                    setEditData({ ...editData, numero_expediente: event.target.value })
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Cliente
                                </label>
                                <select
                                  value={editData.cliente_id}
                                  onChange={(event) => setEditData({ ...editData, cliente_id: event.target.value })}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                >
                                  <option value="">Sin cliente</option>
                                  {clientes.map((cliente) => (
                                    <option key={cliente.id} value={cliente.id}>
                                      {cliente.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Partes *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editData.partes}
                                  onChange={(event) => setEditData({ ...editData, partes: event.target.value })}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Materia *
                                </label>
                                <select
                                  value={editData.materia}
                                  onChange={(event) => handleEditMateriaChange(event.target.value as MateriaJuzgado)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                >
                                  {editMatterOptions.map((materia) => (
                                    <option key={materia} value={materia}>
                                      {materia}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Juzgado *
                                </label>
                                <select
                                  required
                                  value={editUsesManualCourt ? '__manual__' : editData.juzgado}
                                  onChange={(event) => handleEditJuzgadoChange(event.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                >
                                  {editCourtOptions.map((juzgado) => (
                                      <option key={juzgado.id} value={juzgado.nombre}>
                                        {juzgado.nombre}
                                      </option>
                                    ))}
                                  <option value="__manual__">Otro órgano jurisdiccional...</option>
                                </select>
                                {editUsesManualCourt && (
                                  <input
                                    type="text"
                                    required
                                    value={editData.juzgado}
                                    onChange={(event) => setEditData({ ...editData, juzgado: event.target.value })}
                                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
                                    placeholder="Escribe la denominación oficial completa"
                                  />
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Tipo de juicio *
                                </label>
                                <select
                                  value={editData.tipo_juicio}
                                  onChange={(event) => setEditData({ ...editData, tipo_juicio: event.target.value })}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                >
                                  {tiposJuicioPorMateria[editData.materia].map((tipoJuicio) => (
                                    <option key={tipoJuicio} value={tipoJuicio}>
                                      {tipoJuicio}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Estatus *
                                </label>
                                <select
                                  value={editData.estatus}
                                  onChange={(event) => setEditData({ ...editData, estatus: event.target.value })}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                >
                                  <option>Activo</option>
                                  <option>En tramite</option>
                                  <option>Suspendido</option>
                                  <option>Concluido</option>
                                  <option>Archivado</option>
                                </select>
                              </div>

                              <div className="md:col-span-2 flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setEditingExpedienteId(null)}
                                  className="px-4 py-2 border border-slate-300 rounded-md text-sm hover:bg-slate-50"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-2 bg-blue-700 text-white rounded-md text-sm hover:bg-blue-800"
                                >
                                  Guardar cambios
                                </button>
                              </div>
                            </form>
                          )}
                        </div>

                        <div className="mb-4 rounded-md border border-blue-100 bg-white p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-slate-800">Documentos del expediente</h4>
                              <p className="text-xs text-slate-500">
                                PDF, Word e imagenes relacionados con este expediente.
                              </p>
                            </div>
                            {canEdit && (
                              <DocumentQuickUpload
                                label={uploadingTargetId === `expediente-${expediente.id}` ? 'Subiendo...' : 'Adjuntar'}
                                disabled={uploadingTargetId === `expediente-${expediente.id}`}
                                onError={setMessage}
                                onUpload={(files) => handleAttachToExisting('expediente', expediente.id, files)}
                              />
                            )}
                          </div>
                          <DocumentAttachmentList
                            attachments={expedienteAttachmentsById[expediente.id] ?? []}
                            attachmentUrls={attachmentUrls}
                            uploadedByNames={uploadedByNames}
                            relationshipLabel={`Expediente ${expediente.numero_expediente}`}
                            linkedExpedienteId={expediente.id}
                            onOpenInEscriba={onOpenInEscriba}
                            emptyText="Aun no hay archivos adjuntos en este expediente."
                          />
                        </div>

                        <h4 className="font-semibold text-slate-800 mb-3">Movimientos</h4>
                        <div className="space-y-2 mb-4">
                          {expedienteMovimientos.map((movimiento) => (
                            <div
                              key={movimiento.id}
                              className="bg-white p-3 rounded-md border border-slate-200"
                            >
                              <div className="flex justify-between items-start gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {movimiento.tipo}
                                  </p>
                                  <p className="text-sm text-slate-600">{movimiento.descripcion}</p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {new Date(movimiento.fecha).toLocaleDateString('es-MX')}
                                  </p>
                                </div>
                                {canEdit && (
                                  <button
                                    onClick={() => handleDeleteMovimiento(movimiento.id)}
                                    className="text-red-600 hover:text-red-700 p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>

                              <div className="mt-3 space-y-2">
                                <DocumentAttachmentList
                                  attachments={movimientoAttachmentsById[movimiento.id] ?? []}
                                  attachmentUrls={attachmentUrls}
                                  compact
                                  uploadedByNames={uploadedByNames}
                                  relationshipLabel={`Movimiento de ${expediente.numero_expediente}`}
                                  linkedExpedienteId={expediente.id}
                                  onOpenInEscriba={onOpenInEscriba}
                                />
                                {canEdit && (
                                  <DocumentQuickUpload
                                    label={uploadingTargetId === `movimiento-${movimiento.id}` ? 'Subiendo...' : 'Adjuntar al movimiento'}
                                    compact
                                    disabled={uploadingTargetId === `movimiento-${movimiento.id}`}
                                    onError={setMessage}
                                    onUpload={(files) => handleAttachToExisting('movimiento', movimiento.id, files)}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {showMovForm === expediente.id && canEdit ? (
                          <form
                            onSubmit={(e) => handleAddMovimiento(e, expediente.id)}
                            className="bg-white p-3 rounded-md border border-slate-300 space-y-3"
                          >
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Fecha
                              </label>
                              {isAudiencia(newMovimiento.tipo) ? (
                                <input
                                  type="text"
                                  required
                                  inputMode="numeric"
                                  pattern="\d{2}/\d{2}/\d{4}"
                                  placeholder="00/00/0000"
                                  value={newMovimiento.audiencia_fecha}
                                  onChange={(e) =>
                                    setNewMovimiento({
                                      ...newMovimiento,
                                      audiencia_fecha: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                />
                              ) : (
                                <input
                                  type="date"
                                  value={newMovimiento.fecha}
                                  onChange={(e) =>
                                    setNewMovimiento({ ...newMovimiento, fecha: e.target.value })
                                  }
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Tipo de movimiento *
                              </label>
                              <select
                                required
                                value={newMovimiento.tipo}
                                onChange={(e) => {
                                  const nextTipo = e.target.value;
                                  setNewMovimiento({
                                    ...newMovimiento,
                                    tipo: nextTipo,
                                    audiencia_fecha: isAudiencia(nextTipo)
                                      ? toMexicanDateFromDatabase(newMovimiento.fecha)
                                      : newMovimiento.audiencia_fecha,
                                  });
                                }}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                              >
                                {movimientoTipos.map((tipo) => (
                                  <option key={tipo}>{tipo}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Descripción
                              </label>
                              <textarea
                                value={newMovimiento.descripcion}
                                onChange={(e) =>
                                  setNewMovimiento({
                                    ...newMovimiento,
                                    descripcion: e.target.value,
                                  })
                                }
                                rows={2}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-2">
                                Archivos del movimiento
                              </label>
                              <DocumentFilePicker
                                files={newMovimientoFiles}
                                onChange={setNewMovimientoFiles}
                                onError={setMessage}
                                compact
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMovForm(null);
                                  setNewMovimientoFiles([]);
                                }}
                                className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm hover:bg-slate-50"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                className="flex-1 px-2 py-1 bg-blue-700 text-white rounded text-sm hover:bg-blue-800"
                              >
                                Guardar
                              </button>
                            </div>
                          </form>
                        ) : canEdit ? (
                          <button
                            onClick={() => {
                              setShowMovForm(expediente.id);
                              setNewMovimientoFiles([]);
                            }}
                            className="w-full px-3 py-2 border border-blue-200 text-blue-700 rounded-md text-sm hover:bg-blue-50 font-medium transition-colors"
                          >
                            + Anadir Movimiento
                          </button>
                        ) : (
                          <p className="text-sm text-slate-500">Permiso de solo lectura.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
