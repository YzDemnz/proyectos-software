import type { JurisToolContext } from '../lib/jurisTools';
export const buildJurisSystemPrompt = (context: JurisToolContext) => [
  'Eres Juris IA dentro de Judicial Managment, una aplicacion privada de gestion juridica.',
  `Estas trabajando exclusivamente dentro del despacho "${context.despachoName}".`,
  `La fecha local actual es ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date())}.`,
  'Tienes herramientas para consultar datos reales. Usa siempre una herramienta cuando el usuario pregunte por expedientes, clientes, movimientos, documentos, citas, audiencias, agenda o cantidades del despacho.',
  'Antes de redactar apelaciones, demandas, contestaciones, promociones o cualquier escrito, usa preparar_contexto_escrito.',
  'Antes de citar una ley o articulo, usa consultar_biblioteca_juridica. Nunca inventes articulos ni cites de memoria.',
  'preparar_contexto_escrito devuelve una jerarquia obligatoria de fuentes. Un formato privado del despacho siempre tiene prioridad sobre cualquier ejemplo general de Judicial.',
  'Despues del formato privado, usa solamente los datos y documentos reales del expediente. La biblioteca general de Judicial es supletoria: sirve para completar orientacion, nunca para reemplazar o contradecir el formato privado.',
  'Los ejemplos sanitizados solo sirven como referencia de estructura y tono; no copies datos, nombres, domicilios, expedientes ni hechos de ejemplos ajenos.',
  'Un escrito completo solo se permite si preparar_contexto_escrito devuelve selectedDraftingReference o formato_seleccionado. Sigue exactamente sus apartados y orden. Si falta esa referencia, no improvises una estructura general: solicita que el usuario precise el tipo de escrito o cargue un formato en Personaliza a Juris.',
  'Nunca generes documentos titulados "Escritura Inicial de Demandas", prologos genericos ni formatos de relleno. El titulo y las secciones deben derivar de la referencia seleccionada y de los datos verificados.',
  'Si el contexto incluye jurisPersonalization o preferencias_del_despacho, respeta el tono y las instrucciones internas sin contradecir las fuentes ni los datos reales.',
  'Distingue expresamente los hechos del expediente, el texto de documentos, los fundamentos recuperados y las inferencias.',
  'La etapa procesal detectada es una sugerencia. Informa su confianza y solicita confirmacion profesional si afecta un plazo, recurso o estrategia.',
  'En borradores marca con [DATO PENDIENTE] toda fecha, autoridad, acto, notificación o petición que no aparezca en las fuentes.',
  'Cada escrito es un borrador editable sujeto a revision y firma del abogado responsable.',
  'Nunca inventes expedientes, fechas, clientes ni resultados de la base de datos.',
  'Usa tipo audiencia solamente cuando el usuario diga expresamente audiencia. Para una cita o reunión general usa recordatorio u otro.',
  context.canEdit
    ? 'Puedes preparar cambios mediante herramientas. Toda escritura requiere confirmacion visible del usuario antes de ejecutarse.'
    : 'El usuario tiene acceso de solo lectura. No intentes crear ni modificar información.',
  'Para referencias relativas como manana o el proximo lunes, calcula una fecha exacta YYYY-MM-DD antes de llamar una herramienta.',
  'No afirmes ser abogado, juez, autoridad o fuente oficial. No des asesoria juridica definitiva.',
  'Cuando hables de leyes, plazos, audiencias o estrategias, indica que el usuario debe verificar la ley vigente, acuerdos y criterio profesional.',
  'Responde en espanol claro, breve y practico. Resume los resultados de las herramientas sin mostrar JSON crudo.',
].join('\n');

export const normalizeIntentText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

export const getExpedienteReferenceFromPrompt = (prompt: string) => {
  const match = prompt.match(/\b\d{1,9}\s*(?:\/|-)\s*\d{2,4}\b/);
  return match?.[0]?.replace(/\s+/g, '') ?? '';
};

const getDraftTypeFromPrompt = (normalizedPrompt: string) => {
  const types = [
    'apelacion',
    'amparo',
    'contestacion',
    'demanda',
    'alegatos',
    'promocion',
    'incidente',
    'recurso',
  ];
  return types.find((type) => normalizedPrompt.includes(type)) ?? 'escrito juridico';
};

export const getMandatoryPreflight = (prompt: string) => {
  const expedienteReference = getExpedienteReferenceFromPrompt(prompt);
  if (!expedienteReference) return null;

  const normalized = normalizeIntentText(prompt);
  const asksForDraft = /(crea|redacta|elabora|prepara|haz|genera)/.test(normalized)
    && /(escrito|apelacion|amparo|contestacion|demanda|alegatos|promocion|incidente|recurso)/.test(normalized);
  if (asksForDraft) {
    return {
      toolName: 'preparar_contexto_escrito',
      arguments: {
        expediente_referencia: expedienteReference,
        tipo_escrito: getDraftTypeFromPrompt(normalized),
        tema: prompt,
      },
      activity: 'Reuniendo expediente, documentos y fundamentos oficiales...',
    };
  }

  if (/(etapa procesal|estado procesal|fase procesal)/.test(normalized)) {
    return {
      toolName: 'analizar_etapa_procesal',
      arguments: { referencia: expedienteReference },
      activity: 'Analizando la cronologia y la etapa procesal...',
    };
  }

  if (/(pdf|documento|archivo|adjunto)/.test(normalized) && /(lee|revisa|analiza|consulta|busca)/.test(normalized)) {
    return {
      toolName: 'leer_documentos_expediente',
      arguments: { referencia: expedienteReference, enfoque: prompt, limite: 8 },
      activity: 'Leyendo los documentos del expediente...',
    };
  }

  return null;
};

interface SelectedDraftingReference {
  title: string;
  source?: 'private' | 'platform';
  structure?: string[];
}

export const getDraftingReference = (result: unknown): SelectedDraftingReference | null => {
  if (!result || typeof result !== 'object') return null;
  const response = result as {
    ok?: boolean;
    data?: { selectedDraftingReference?: SelectedDraftingReference | null };
  };
  const reference = response.data?.selectedDraftingReference;
  return response.ok && reference?.title ? reference : null;
};

export const hasDraftingReference = (result: unknown) => Boolean(getDraftingReference(result));

export const validateDraftResponse = (content: string, reference: SelectedDraftingReference) => {
  const normalized = normalizeIntentText(content.replace(/<[^>]+>/g, ' '));
  if (!normalized.trim()) return 'La respuesta quedo vacia.';
  if (/escritura inicial de demandas|\bprologo\b/.test(normalized)) {
    return 'La respuesta uso una plantilla generica prohibida.';
  }
  const headings = (reference.structure ?? [])
    .map(normalizeIntentText)
    .filter((heading) => heading.length >= 3)
    .slice(0, 8);
  if (headings.length >= 2) {
    const matches = headings.filter((heading) => normalized.includes(heading)).length;
    if (matches < Math.min(2, headings.length)) {
      return 'La respuesta no respeto suficientes apartados del formato seleccionado.';
    }
  }
  return null;
};

