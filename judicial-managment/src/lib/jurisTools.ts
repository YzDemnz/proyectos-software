import { createAudienceCalendarEvent, isAudiencia } from './calendar';
import {
  analyzeProcessStage,
  prepareLegalDraftContext,
  readExpedienteDocuments,
  searchLegalLibrary,
} from './legalLibrary';
import {
  supabase,
  type CalendarioEvento,
  type Cliente,
  type DocumentAttachment,
  type Expediente,
} from './supabase';

export interface JurisToolContext {
  despachoId: string;
  despachoName: string;
  canEdit: boolean;
}

export interface JurisToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

export interface JurisToolCall {
  id?: string;
  function: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface JurisPendingAction {
  id: string;
  toolName: JurisMutationToolName;
  arguments: Record<string, unknown>;
  title: string;
  details: string[];
}

type JurisMutationToolName =
  | 'agendar_evento'
  | 'registrar_movimiento'
  | 'crear_expediente'
  | 'actualizar_expediente';

const mutationToolNames = new Set<JurisMutationToolName>([
  'agendar_evento',
  'registrar_movimiento',
  'crear_expediente',
  'actualizar_expediente',
]);

const readToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'resumen_despacho',
      description: 'Obtiene cantidades reales de expedientes, clientes, movimientos y proximos eventos del despacho actual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_expedientes',
      description: 'Busca expedientes reales del despacho por numero, partes, juzgado, materia, tipo de juicio o estatus.',
      parameters: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description: 'Numero de expediente, nombre de una parte, juzgado, materia, tipo o estatus.',
          },
          limite: {
            type: 'integer',
            description: 'Cantidad maxima de resultados, entre 1 y 30.',
          },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_expediente',
      description: 'Lee el expediente solicitado con sus movimientos, fechas de calendario y lista de archivos adjuntos.',
      parameters: {
        type: 'object',
        properties: {
          referencia: {
            type: 'string',
            description: 'ID, numero de expediente o texto unico de las partes.',
          },
        },
        required: ['referencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'leer_documentos_expediente',
      description: 'Extrae y lee el texto de los PDF y DOCX adjuntos a un expediente y a sus movimientos. Indica los archivos escaneados que requieren OCR.',
      parameters: {
        type: 'object',
        properties: {
          referencia: {
            type: 'string',
            description: 'ID, numero de expediente o texto unico de las partes.',
          },
          enfoque: {
            type: 'string',
            description: 'Palabras o tema que deben priorizarse al seleccionar fragmentos.',
          },
          limite: {
            type: 'integer',
            description: 'Cantidad maxima de documentos a leer, entre 1 y 12.',
          },
        },
        required: ['referencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_etapa_procesal',
      description: 'Analiza cronologia, movimientos y documentos legibles para sugerir la etapa procesal. La sugerencia requiere confirmacion de un abogado.',
      parameters: {
        type: 'object',
        properties: {
          referencia: {
            type: 'string',
            description: 'ID, numero de expediente o texto unico de las partes.',
          },
        },
        required: ['referencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_biblioteca_juridica',
      description: 'Busca articulos y fragmentos en la biblioteca de legislacion oficial versionada. Debe usarse antes de citar una norma.',
      parameters: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description: 'Concepto juridico, acto procesal, recurso o fundamento buscado.',
          },
          materia: {
            type: 'string',
            description: 'Materia opcional: mercantil, civil, familiar, penal, laboral o amparo.',
          },
          jurisdiccion: {
            type: 'string',
            enum: ['federal', 'nacional', 'coahuila'],
          },
          limite: {
            type: 'integer',
            description: 'Cantidad maxima de fragmentos, entre 1 y 20.',
          },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preparar_contexto_escrito',
      description: 'Reune datos reales, documentos, etapa sugerida, fundamentos oficiales y ejemplos sanitizados para redactar un escrito. Usala antes de crear apelaciones, demandas, contestaciones o promociones.',
      parameters: {
        type: 'object',
        properties: {
          expediente_referencia: {
            type: 'string',
            description: 'Numero o ID del expediente.',
          },
          tipo_escrito: {
            type: 'string',
            description: 'Tipo de escrito, por ejemplo apelacion, contestacion, demanda o promocion.',
          },
          tema: {
            type: 'string',
            description: 'Resolucion, acto, agravio o cuestion concreta que abordara el escrito.',
          },
        },
        required: ['expediente_referencia', 'tipo_escrito'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_agenda',
      description: 'Consulta citas, audiencias, vencimientos y recordatorios reales del calendario.',
      parameters: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD. Por defecto hoy.' },
          hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD. Por defecto 30 dias despues.' },
          limite: { type: 'integer', description: 'Cantidad maxima de resultados, entre 1 y 50.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_clientes',
      description: 'Busca clientes reales del despacho por nombre y muestra su informacion financiera basica.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'Nombre o fragmento del nombre. Puede quedar vacio para listar.' },
          limite: { type: 'integer', description: 'Cantidad maxima de resultados, entre 1 y 30.' },
        },
      },
    },
  },
] as const;

const mutationToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'agendar_evento',
      description: 'Prepara una cita, audiencia, vencimiento o recordatorio. Usa audiencia solo si el usuario lo dice expresamente; para citas o reuniones usa recordatorio u otro. La app pedira confirmacion antes de guardarlo.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Titulo claro del evento.' },
          fecha: { type: 'string', description: 'Fecha exacta YYYY-MM-DD.' },
          hora: { type: 'string', description: 'Hora opcional HH:MM en formato de 24 horas.' },
          descripcion: { type: 'string', description: 'Detalles de la cita o recordatorio.' },
          tipo: {
            type: 'string',
            enum: ['audiencia', 'vencimiento', 'recordatorio', 'otro'],
          },
          expediente_referencia: {
            type: 'string',
            description: 'Numero o ID del expediente relacionado. Omitir si es una cita general.',
          },
          avisar_dia_antes: { type: 'boolean' },
          avisar_mismo_dia: { type: 'boolean' },
        },
        required: ['titulo', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_movimiento',
      description: 'Prepara un movimiento dentro de un expediente. Si es audiencia tambien lo agrega al calendario.',
      parameters: {
        type: 'object',
        properties: {
          expediente_referencia: { type: 'string', description: 'Numero o ID del expediente.' },
          fecha: { type: 'string', description: 'Fecha YYYY-MM-DD.' },
          tipo: {
            type: 'string',
            enum: ['Audiencia', 'Presentacion de Pruebas', 'Alegatos', 'Resolucion', 'Apelacion', 'Otros'],
          },
          descripcion: { type: 'string', description: 'Detalle completo del movimiento.' },
        },
        required: ['expediente_referencia', 'fecha', 'tipo', 'descripcion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_expediente',
      description: 'Prepara un expediente nuevo con la informacion proporcionada. Requiere confirmacion visible.',
      parameters: {
        type: 'object',
        properties: {
          numero_expediente: { type: 'string' },
          partes: { type: 'string' },
          materia: { type: 'string' },
          juzgado: { type: 'string' },
          tipo_juicio: { type: 'string' },
          estatus: { type: 'string', enum: ['Activo', 'En tramite', 'Suspendido', 'Concluido', 'Archivado'] },
        },
        required: ['numero_expediente', 'partes', 'materia', 'juzgado', 'tipo_juicio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_expediente',
      description: 'Prepara cambios permitidos en un expediente existente. Solo modifica los campos indicados.',
      parameters: {
        type: 'object',
        properties: {
          expediente_referencia: { type: 'string', description: 'Numero o ID del expediente.' },
          numero_expediente: { type: 'string' },
          partes: { type: 'string' },
          materia: { type: 'string' },
          juzgado: { type: 'string' },
          tipo_juicio: { type: 'string' },
          estatus: { type: 'string', enum: ['Activo', 'En tramite', 'Suspendido', 'Concluido', 'Archivado'] },
        },
        required: ['expediente_referencia'],
      },
    },
  },
] as const;

export const getJurisToolDefinitions = (canEdit: boolean) => [
  ...readToolDefinitions,
  ...(canEdit ? mutationToolDefinitions : []),
];

export const isJurisMutationTool = (name: string): name is JurisMutationToolName => {
  return mutationToolNames.has(name as JurisMutationToolName);
};

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const asBoolean = (value: unknown, fallback: boolean) => (
  typeof value === 'boolean' ? value : fallback
);

const clampLimit = (value: unknown, fallback: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
};

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

const normalizeDate = (value: unknown) => {
  const text = asText(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const mexicanMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : mexicanMatch
      ? { year: Number(mexicanMatch[3]), month: Number(mexicanMatch[2]), day: Number(mexicanMatch[1]) }
      : null;

  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const normalizeTime = (value: unknown) => {
  const text = asText(value);
  if (!text) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return match ? `${match[1]}:${match[2]}:00` : null;
};

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (value: string, days: number) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

const loadExpedientes = async (despachoId: string) => {
  const { data, error } = await supabase
    .from('expedientes')
    .select('id,numero_expediente,partes,juzgado,materia,tipo_juicio,estatus,cliente_id,created_at,updated_at')
    .eq('despacho_id', despachoId)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as Expediente[];
};

const resolveExpediente = async (despachoId: string, reference: string) => {
  const expedientes = await loadExpedientes(despachoId);
  const normalizedReference = normalizeSearchText(reference);

  return expedientes.find((item) => item.id === reference)
    ?? expedientes.find((item) => normalizeSearchText(item.numero_expediente) === normalizedReference)
    ?? expedientes.find((item) => normalizeSearchText(item.numero_expediente).includes(normalizedReference))
    ?? expedientes.find((item) => normalizeSearchText(item.partes).includes(normalizedReference))
    ?? null;
};

const auditJurisAction = async (
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('audit_log').insert([{
    actor_user_id: user.id,
    action,
    entity,
    entity_id: entityId,
    details: { source: 'juris_ai', ...details },
  }]);
};

const summarizeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'No se pudo completar la operacion.';
};

export const executeJurisReadTool = async (
  name: string,
  args: Record<string, unknown>,
  context: JurisToolContext,
): Promise<JurisToolResult> => {
  try {
    if (name === 'resumen_despacho') {
      const today = localDateKey();
      const nextThirtyDays = addDays(today, 30);
      const [expedientes, clientes, movimientos, eventos] = await Promise.all([
        supabase.from('expedientes').select('*', { count: 'exact', head: true }).eq('despacho_id', context.despachoId),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('despacho_id', context.despachoId),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('despacho_id', context.despachoId),
        supabase
          .from('calendario_eventos')
          .select('id,titulo,event_date,event_time,tipo,expediente_id')
          .eq('despacho_id', context.despachoId)
          .gte('event_date', today)
          .lte('event_date', nextThirtyDays)
          .order('event_date')
          .limit(10),
      ]);

      const firstError = expedientes.error ?? clientes.error ?? movimientos.error ?? eventos.error;
      if (firstError) throw firstError;

      const data = {
        despacho: context.despachoName,
        expedientes: expedientes.count ?? 0,
        clientes: clientes.count ?? 0,
        movimientos: movimientos.count ?? 0,
        proximos_eventos: eventos.data ?? [],
      };
      return {
        ok: true,
        summary: [
          `Despacho: ${context.despachoName}.`,
          `Expedientes: ${data.expedientes}.`,
          `Clientes: ${data.clientes}.`,
          `Movimientos: ${data.movimientos}.`,
          `Eventos proximos: ${data.proximos_eventos.length}.`,
        ].join(' '),
        data,
      };
    }

    if (name === 'buscar_expedientes') {
      const query = normalizeSearchText(asText(args.consulta));
      const limit = clampLimit(args.limite, 10, 30);
      const expedientes = await loadExpedientes(context.despachoId);
      const filtered = expedientes
        .filter((item) => {
          const haystack = normalizeSearchText([
            item.numero_expediente,
            item.partes,
            item.juzgado,
            item.materia ?? '',
            item.tipo_juicio ?? '',
            item.estatus,
          ].join(' '));
          return !query || haystack.includes(query);
        })
        .slice(0, limit);

      return {
        ok: true,
        summary: filtered.length
          ? `Se encontraron ${filtered.length} expediente(s): ${filtered
              .map((item) => `${item.numero_expediente} (${item.partes}, ${item.estatus})`)
              .join('; ')}.`
          : 'No se encontraron expedientes con esa referencia.',
        data: filtered,
      };
    }

    if (name === 'obtener_expediente') {
      const reference = asText(args.referencia);
      const expediente = await resolveExpediente(context.despachoId, reference);
      if (!expediente) {
        return { ok: false, summary: `No encontre un expediente que coincida con "${reference}".` };
      }

      const [movimientos, eventos, adjuntos, cliente] = await Promise.all([
        supabase
          .from('movimientos')
          .select('id,fecha,tipo,descripcion,created_at')
          .eq('despacho_id', context.despachoId)
          .eq('expediente_id', expediente.id)
          .order('fecha', { ascending: false }),
        supabase
          .from('calendario_eventos')
          .select('id,titulo,descripcion,event_date,event_time,tipo,notify_day_before,notify_same_day')
          .eq('despacho_id', context.despachoId)
          .eq('expediente_id', expediente.id)
          .order('event_date'),
        supabase
          .from('document_adjuntos')
          .select('id,target_type,file_name,file_type,file_size,created_at,movimiento_id')
          .eq('despacho_id', context.despachoId)
          .eq('expediente_id', expediente.id)
          .order('created_at'),
        expediente.cliente_id
          ? supabase
              .from('clientes')
              .select('id,nombre,monto_pactado,total_adeudo')
              .eq('despacho_id', context.despachoId)
              .eq('id', expediente.cliente_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const firstError = movimientos.error ?? eventos.error ?? adjuntos.error ?? cliente.error;
      if (firstError) throw firstError;

      return {
        ok: true,
        summary: `Informacion completa del expediente ${expediente.numero_expediente}.`,
        data: {
          expediente,
          cliente: cliente.data,
          movimientos: movimientos.data ?? [],
          calendario: eventos.data ?? [],
          archivos: (adjuntos.data ?? []) as DocumentAttachment[],
        },
      };
    }

    if (name === 'leer_documentos_expediente') {
      const reference = asText(args.referencia);
      const expediente = await resolveExpediente(context.despachoId, reference);
      if (!expediente) {
        return { ok: false, summary: `No encontre un expediente que coincida con "${reference}".` };
      }

      const focusTerms = asText(args.enfoque)
        .split(/[,;]|\s{2,}/)
        .map((term) => term.trim())
        .filter(Boolean);
      const documents = await readExpedienteDocuments({
        despachoId: context.despachoId,
        expedienteId: expediente.id,
        searchTerms: focusTerms,
        limit: clampLimit(args.limite, 8, 12),
      });
      const ready = documents.filter((document) => document.status === 'ready').length;
      const needsOcr = documents.filter((document) => document.status === 'needs_ocr').length;

      return {
        ok: true,
        summary: `Expediente ${expediente.numero_expediente}: ${ready} documento(s) legible(s) y ${needsOcr} que requieren OCR.`,
        data: { expediente, documentos: documents },
      };
    }

    if (name === 'analizar_etapa_procesal') {
      const reference = asText(args.referencia);
      const expediente = await resolveExpediente(context.despachoId, reference);
      if (!expediente) {
        return { ok: false, summary: `No encontre un expediente que coincida con "${reference}".` };
      }

      const analysis = await analyzeProcessStage({
        despachoId: context.despachoId,
        expediente,
      });
      return {
        ok: true,
        summary: `Etapa sugerida para ${expediente.numero_expediente}: ${analysis.suggestedStage} (confianza ${(analysis.confidence * 100).toFixed(0)}%). Requiere confirmacion profesional.`,
        data: { expediente, analisis: analysis },
      };
    }

    if (name === 'consultar_biblioteca_juridica') {
      const query = asText(args.consulta);
      if (!query) return { ok: false, summary: 'Indica el concepto juridico que deseas consultar.' };

      const results = await searchLegalLibrary({
        query,
        materia: asText(args.materia) || undefined,
        jurisdiction: asText(args.jurisdiccion) || undefined,
        limit: clampLimit(args.limite, 8, 20),
      });
      return {
        ok: true,
        summary: results.length
          ? `Se encontraron ${results.length} fragmento(s) oficiales. Cita solamente los aplicables al caso.`
          : 'No se encontraron fragmentos. No cites articulos de memoria: amplia la consulta o verifica que la biblioteca haya sido cargada.',
        data: results,
      };
    }

    if (name === 'preparar_contexto_escrito') {
      const reference = asText(args.expediente_referencia);
      const documentType = asText(args.tipo_escrito);
      const expediente = await resolveExpediente(context.despachoId, reference);
      if (!expediente) {
        return { ok: false, summary: `No encontre el expediente "${reference}".` };
      }
      if (!documentType) {
        return { ok: false, summary: 'Indica el tipo de escrito que se debe preparar.' };
      }

      const draftContext = await prepareLegalDraftContext({
        despachoId: context.despachoId,
        expediente,
        documentType,
        subject: asText(args.tema),
      });
      const selectedReference = draftContext.selectedDraftingReference;
      const referenceLabel = selectedReference
        ? `${selectedReference.source === 'private' ? 'formato privado del despacho' : 'formato supletorio de Judicial'} "${selectedReference.title}"`
        : 'ningun formato validado';
      return {
        ok: true,
        summary: `Contexto preparado para un borrador de ${documentType} del expediente ${expediente.numero_expediente}. Se selecciono ${referenceLabel}. Deben confirmarse la resolucion impugnada, la fecha de notificacion, el plazo y la autoridad competente.`,
        data: draftContext,
      };
    }

    if (name === 'listar_agenda') {
      const from = normalizeDate(args.desde) ?? localDateKey();
      const to = normalizeDate(args.hasta) ?? addDays(from, 30);
      const limit = clampLimit(args.limite, 20, 50);
      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('id,titulo,descripcion,event_date,event_time,tipo,expediente_id,notify_day_before,notify_same_day')
        .eq('despacho_id', context.despachoId)
        .gte('event_date', from)
        .lte('event_date', to)
        .order('event_date')
        .order('event_time')
        .limit(limit);

      if (error) throw error;
      return {
        ok: true,
        summary: (data?.length ?? 0) > 0
          ? `${data?.length ?? 0} evento(s) entre ${from} y ${to}: ${(data ?? [])
              .map((event) => `${event.event_date}${event.event_time ? ` ${event.event_time}` : ''} - ${event.titulo}`)
              .join('; ')}.`
          : `No hay eventos entre ${from} y ${to}.`,
        data: (data ?? []) as CalendarioEvento[],
      };
    }

    if (name === 'buscar_clientes') {
      const query = normalizeSearchText(asText(args.consulta));
      const limit = clampLimit(args.limite, 10, 30);
      const { data, error } = await supabase
        .from('clientes')
        .select('id,nombre,monto_pactado,total_adeudo,created_at')
        .eq('despacho_id', context.despachoId)
        .order('nombre')
        .limit(300);

      if (error) throw error;
      const clients = ((data ?? []) as Cliente[])
        .filter((client) => !query || normalizeSearchText(client.nombre).includes(query))
        .slice(0, limit);

      return {
        ok: true,
        summary: clients.length ? `${clients.length} cliente(s) encontrado(s).` : 'No se encontraron clientes.',
        data: clients,
      };
    }

    return { ok: false, summary: `La herramienta "${name}" no esta disponible.` };
  } catch (error) {
    return { ok: false, summary: summarizeError(error) };
  }
};

export const createJurisPendingAction = (
  name: JurisMutationToolName,
  args: Record<string, unknown>,
): JurisPendingAction => {
  const reference = asText(args.expediente_referencia);

  if (name === 'agendar_evento') {
    return {
      id: crypto.randomUUID(),
      toolName: name,
      arguments: args,
      title: 'Confirmar nuevo evento',
      details: [
        `Titulo: ${asText(args.titulo) || 'Sin titulo'}`,
        `Fecha: ${asText(args.fecha) || 'Sin fecha'}${asText(args.hora) ? ` a las ${asText(args.hora)}` : ''}`,
        `Tipo: ${asText(args.tipo) || 'recordatorio'}`,
        ...(reference ? [`Expediente: ${reference}`] : []),
        ...(asText(args.descripcion) ? [`Detalle: ${asText(args.descripcion)}`] : []),
      ],
    };
  }

  if (name === 'registrar_movimiento') {
    return {
      id: crypto.randomUUID(),
      toolName: name,
      arguments: args,
      title: 'Confirmar movimiento',
      details: [
        `Expediente: ${reference || 'Sin referencia'}`,
        `Fecha: ${asText(args.fecha) || 'Sin fecha'}`,
        `Tipo: ${asText(args.tipo) || 'Sin tipo'}`,
        `Detalle: ${asText(args.descripcion) || 'Sin descripcion'}`,
      ],
    };
  }

  if (name === 'crear_expediente') {
    return {
      id: crypto.randomUUID(),
      toolName: name,
      arguments: args,
      title: 'Confirmar nuevo expediente',
      details: [
        `Numero: ${asText(args.numero_expediente) || 'Sin numero'}`,
        `Partes: ${asText(args.partes) || 'Sin partes'}`,
        `Materia: ${asText(args.materia) || 'Sin materia'}`,
        `Juzgado: ${asText(args.juzgado) || 'Sin juzgado'}`,
        `Tipo: ${asText(args.tipo_juicio) || 'Sin tipo de juicio'}`,
      ],
    };
  }

  const changes = ['numero_expediente', 'partes', 'materia', 'juzgado', 'tipo_juicio', 'estatus']
    .filter((key) => asText(args[key]))
    .map((key) => `${key.replace('_', ' ')}: ${asText(args[key])}`);
  return {
    id: crypto.randomUUID(),
    toolName: name,
    arguments: args,
    title: 'Confirmar cambios del expediente',
    details: [`Expediente: ${reference || 'Sin referencia'}`, ...changes],
  };
};

export const executeJurisMutationTool = async (
  action: JurisPendingAction,
  context: JurisToolContext,
): Promise<JurisToolResult> => {
  if (!context.canEdit) {
    return { ok: false, summary: 'Tu perfil es de solo lectura y no puede modificar datos del despacho.' };
  }

  const args = action.arguments;

  try {
    if (action.toolName === 'agendar_evento') {
      const title = asText(args.titulo);
      const date = normalizeDate(args.fecha);
      if (!title || !date) {
        return { ok: false, summary: 'El evento necesita un titulo y una fecha valida.' };
      }

      const reference = asText(args.expediente_referencia);
      const expediente = reference ? await resolveExpediente(context.despachoId, reference) : null;
      if (reference && !expediente) {
        return { ok: false, summary: `No encontre el expediente "${reference}".` };
      }

      const allowedTypes = ['audiencia', 'vencimiento', 'recordatorio', 'otro'];
      const requestedType = asText(args.tipo).toLocaleLowerCase('es-MX');
      const type = allowedTypes.includes(requestedType) ? requestedType : 'recordatorio';
      const time = normalizeTime(args.hora);
      if (asText(args.hora) && !time) {
        return { ok: false, summary: 'La hora debe usar el formato HH:MM de 24 horas.' };
      }

      const { data, error } = await supabase
        .from('calendario_eventos')
        .insert([{
          despacho_id: context.despachoId,
          expediente_id: expediente?.id ?? null,
          titulo: title,
          descripcion: asText(args.descripcion),
          event_date: date,
          event_time: time,
          tipo: type,
          notify_day_before: asBoolean(args.avisar_dia_antes, true),
          notify_same_day: asBoolean(args.avisar_mismo_dia, true),
        }])
        .select('id,titulo,event_date,event_time,tipo')
        .single();

      if (error) throw error;
      await auditJurisAction('juris_ai_create', 'calendario_eventos', data.id, {
        despacho_id: context.despachoId,
        title,
        date,
      });
      return { ok: true, summary: `Evento "${title}" agendado para ${date}.`, data };
    }

    if (action.toolName === 'registrar_movimiento') {
      const reference = asText(args.expediente_referencia);
      const expediente = await resolveExpediente(context.despachoId, reference);
      if (!expediente) {
        return { ok: false, summary: `No encontre el expediente "${reference}".` };
      }

      const date = normalizeDate(args.fecha);
      const type = asText(args.tipo);
      const description = asText(args.descripcion);
      if (!date || !type || !description) {
        return { ok: false, summary: 'El movimiento necesita fecha, tipo y descripcion validos.' };
      }

      const { data, error } = await supabase
        .from('movimientos')
        .insert([{
          expediente_id: expediente.id,
          despacho_id: context.despachoId,
          fecha: date,
          tipo: type,
          descripcion: description,
        }])
        .select('id')
        .single();

      if (error) throw error;
      let calendarCreated = false;
      if (isAudiencia(type)) {
        const calendarResult = await createAudienceCalendarEvent({
          despachoId: context.despachoId,
          expedienteId: expediente.id,
          movimientoId: data.id,
          expedienteNumero: expediente.numero_expediente,
          descripcion: description,
          fecha: date,
        });
        if (calendarResult.error) throw calendarResult.error;
        calendarCreated = true;
      }

      await auditJurisAction('juris_ai_create', 'movimientos', data.id, {
        despacho_id: context.despachoId,
        expediente_id: expediente.id,
        type,
      });
      return {
        ok: true,
        summary: calendarCreated
          ? `Movimiento guardado y audiencia agregada al calendario del expediente ${expediente.numero_expediente}.`
          : `Movimiento guardado en el expediente ${expediente.numero_expediente}.`,
        data: { id: data.id, calendarCreated },
      };
    }

    if (action.toolName === 'crear_expediente') {
      const payload = {
        despacho_id: context.despachoId,
        numero_expediente: asText(args.numero_expediente),
        partes: asText(args.partes),
        materia: asText(args.materia),
        juzgado: asText(args.juzgado),
        tipo_juicio: asText(args.tipo_juicio),
        estatus: asText(args.estatus) || 'Activo',
      };
      if (!payload.numero_expediente || !payload.partes || !payload.materia || !payload.juzgado || !payload.tipo_juicio) {
        return { ok: false, summary: 'Faltan datos obligatorios para crear el expediente.' };
      }

      const { data, error } = await supabase
        .from('expedientes')
        .insert([payload])
        .select('id,numero_expediente,partes,estatus')
        .single();
      if (error) throw error;

      await auditJurisAction('juris_ai_create', 'expedientes', data.id, {
        despacho_id: context.despachoId,
        numero_expediente: payload.numero_expediente,
      });
      return { ok: true, summary: `Expediente ${payload.numero_expediente} creado correctamente.`, data };
    }

    const reference = asText(args.expediente_referencia);
    const expediente = await resolveExpediente(context.despachoId, reference);
    if (!expediente) {
      return { ok: false, summary: `No encontre el expediente "${reference}".` };
    }

    const allowedFields = ['numero_expediente', 'partes', 'materia', 'juzgado', 'tipo_juicio', 'estatus'] as const;
    const updates = allowedFields.reduce<Record<string, string>>((result, field) => {
      const value = asText(args[field]);
      if (value) result[field] = value;
      return result;
    }, {});
    if (Object.keys(updates).length === 0) {
      return { ok: false, summary: 'No se indicaron cambios para el expediente.' };
    }

    const { data, error } = await supabase
      .from('expedientes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('despacho_id', context.despachoId)
      .eq('id', expediente.id)
      .select('id,numero_expediente,partes,estatus')
      .single();
    if (error) throw error;

    await auditJurisAction('juris_ai_update', 'expedientes', expediente.id, {
      despacho_id: context.despachoId,
      changes: updates,
    });
    return { ok: true, summary: `Expediente ${data.numero_expediente} actualizado.`, data };
  } catch (error) {
    return { ok: false, summary: summarizeError(error) };
  }
};
