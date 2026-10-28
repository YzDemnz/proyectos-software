import { extractBrowserDocumentText } from '../web/browserDocuments';
import {
  supabase,
  type DocumentAttachment,
  type Expediente,
  type Movimiento,
} from './supabase';
import { findDraftingExamples, type DraftingExampleMatch } from './draftingExamples';

let remoteDraftingLibraryAvailable: boolean | null = null;

interface RemoteDraftingExampleRow {
  id: string;
  title: string;
  kind: string;
  matter: string;
  keywords?: unknown;
  structure?: unknown;
  source_excerpt?: string | null;
  sanitized_docx_path?: string | null;
  score?: number | null;
}

interface JurisPreferenceRow {
  response_tone?: 'formal' | 'claro' | 'directo' | null;
  custom_instructions?: string | null;
}

interface JurisReferenceRow {
  id: string;
  title: string;
  file_name: string;
  extracted_text?: string | null;
  document_kind?: string | null;
  matter?: string | null;
  keywords?: unknown;
  priority?: number | null;
  is_default?: boolean | null;
  score?: number | null;
  selection_reason?: string | null;
}

const toStringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item)).filter(Boolean)
  : [];

const normalizeDraftSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

const tokenizeDraftSearchText = (value: string) => normalizeDraftSearchText(value)
  .split(/[^a-z0-9]+/)
  .filter((term) => term.length >= 4);

const inferRequestedDocumentKind = (value: string) => {
  const normalized = normalizeDraftSearchText(value);
  const kinds = [
    'contestacion',
    'apelacion',
    'amparo',
    'demanda',
    'alegatos',
    'promocion',
    'incidente',
    'recurso',
    'queja',
    'convenio',
  ];
  return kinds.find((kind) => normalized.includes(kind)) ?? normalized.split(/\s+/).slice(0, 5).join(' ');
};

const extractReferenceStructure = (text: string) => text
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/\s+/g, ' '))
  .filter((line) => line.length >= 3 && line.length <= 90)
  .filter((line) => /^(prestaciones|hechos|derecho|pruebas|alegatos|agravios|conceptos de violacion|puntos petitorios|petitorios|protesto|excepciones|defensas|antecedentes|autoridad responsable|acto reclamado)/i.test(line) || line === line.toUpperCase())
  .slice(0, 12);

const scorePrivateReference = (
  reference: JurisReferenceRow,
  queryTerms: string[],
  matter: string,
  documentType: string,
) => {
  const normalizedMatter = normalizeDraftSearchText(matter);
  const normalizedDocumentType = normalizeDraftSearchText(documentType);
  const searchable = normalizeDraftSearchText([
    reference.title,
    reference.file_name,
    reference.document_kind ?? '',
    reference.matter ?? '',
    toStringArray(reference.keywords).join(' '),
    (reference.extracted_text ?? '').slice(0, 60_000),
  ].join(' '));
  let score = Number(reference.score ?? 0);
  if (normalizedMatter && normalizeDraftSearchText(reference.matter ?? '') === normalizedMatter) score += 40;
  if (normalizedDocumentType && normalizeDraftSearchText(reference.document_kind ?? '') === normalizedDocumentType) score += 50;
  score += queryTerms.reduce((total, term) => total + (searchable.includes(term) ? 5 : 0), 0);
  score += Math.min(25, Math.floor(Number(reference.priority ?? 100) / 20));
  if (reference.is_default) score += 4;
  return score;
};

const toPrivateDraftingMatch = (
  reference: JurisReferenceRow,
  score: number,
  queryTerms: string[],
  matter: string,
): DraftingExampleMatch => {
  const referenceText = (reference.extracted_text ?? '').trim().slice(0, 160_000);
  const excerpt = referenceText.length <= 12_000
    ? referenceText
    : `${referenceText.slice(0, 8_000)}\n[...contenido intermedio omitido...]\n${referenceText.slice(-4_000)}`;
  return {
    id: reference.id,
    title: reference.title,
    kind: reference.document_kind?.trim() || 'formato privado del despacho',
    matter: reference.matter?.trim() || matter || 'general',
    keywords: toStringArray(reference.keywords).length > 0
      ? toStringArray(reference.keywords)
      : queryTerms,
    sanitizedDocx: '',
    score,
    selectionReason: reference.selection_reason?.trim()
      || 'Formato privado del despacho seleccionado antes que la biblioteca general.',
    structure: extractReferenceStructure(referenceText),
    excerpt,
    source: 'private',
    sourcePriority: 1000 + Number(reference.priority ?? 100),
  };
};

const searchRemoteDraftingExamples = async ({
  documentType,
  matter,
}: {
  documentType: string;
  matter: string;
}): Promise<DraftingExampleMatch[]> => {
  if (remoteDraftingLibraryAvailable === false) return [];

  const { data, error } = await supabase.rpc('search_drafting_examples', {
    search_text: documentType,
    matter_filter: matter || null,
    result_limit: 1,
  });

  if (error) {
    remoteDraftingLibraryAvailable = false;
    return [];
  }

  remoteDraftingLibraryAvailable = true;
  return ((data ?? []) as RemoteDraftingExampleRow[]).map((entry) => ({
    id: String(entry.id),
    title: String(entry.title),
    kind: String(entry.kind),
    matter: String(entry.matter),
    keywords: toStringArray(entry.keywords),
    sanitizedDocx: String(entry.sanitized_docx_path ?? ''),
    score: Number(entry.score ?? 0),
    selectionReason: `Formato sanitizado de la biblioteca general de Judicial (${String(entry.kind)}).`,
    structure: toStringArray(entry.structure),
    excerpt: String(entry.source_excerpt ?? '').slice(0, 1_500),
    source: 'platform',
    sourcePriority: 100,
  }));
};

const searchJurisPersonalization = async ({
  despachoId,
  query,
  matter,
}: {
  despachoId: string;
  query: string;
  matter: string;
}): Promise<{
  preferences: { responseTone: 'formal' | 'claro' | 'directo'; customInstructions: string } | null;
  matches: DraftingExampleMatch[];
}> => {
  const queryTerms = tokenizeDraftSearchText(`${query} ${matter}`);
  const documentType = inferRequestedDocumentKind(query);
  const cachedReferences = window.judicialDesktop?.getJurisReferenceCache
    ? await window.judicialDesktop.getJurisReferenceCache(despachoId).catch(() => [])
    : [];
  const cachedMatches = cachedReferences
    .map((reference) => {
      const row: JurisReferenceRow = {
        id: reference.id,
        title: reference.title,
        file_name: reference.fileName,
        extracted_text: reference.extractedText,
        document_kind: reference.documentKind,
        matter: reference.matter,
        keywords: reference.keywords,
        priority: reference.priority,
        is_default: reference.isDefault,
      };
      return { reference: row, score: scorePrivateReference(row, queryTerms, matter, documentType) };
    })
    .filter(({ reference, score }) => score >= 10 || reference.is_default)
    .map(({ reference, score }) => toPrivateDraftingMatch(reference, score, queryTerms, matter));

  const preferenceResult = await supabase
    .from('juris_preferencias')
    .select('response_tone,custom_instructions')
    .eq('despacho_id', despachoId)
    .maybeSingle();

  let serverRows: JurisReferenceRow[] = [];
  const rpcResult = await supabase.rpc('search_juris_references', {
    target_despacho_id: despachoId,
    search_text: query,
    matter_filter: matter || null,
    document_kind_filter: documentType || null,
    result_limit: 3,
  });

  if (!rpcResult.error) {
    serverRows = (rpcResult.data ?? []) as JurisReferenceRow[];
  } else if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(rpcResult.error.code ?? '')) {
    const extendedFallbackResult = await supabase
      .from('juris_referencias')
      .select('id,title,file_name,extracted_text,document_kind,matter,keywords,priority,is_default')
      .eq('despacho_id', despachoId)
      .eq('extraction_status', 'ready')
      .order('created_at', { ascending: false })
      .limit(60);
    let fallbackData: unknown[] = extendedFallbackResult.data ?? [];
    let fallbackError = extendedFallbackResult.error;
    if (fallbackError?.code === 'PGRST204' || fallbackError?.code === '42703') {
      const legacyFallbackResult = await supabase
        .from('juris_referencias')
        .select('id,title,file_name,extracted_text')
        .eq('despacho_id', despachoId)
        .eq('extraction_status', 'ready')
        .order('created_at', { ascending: false })
        .limit(60);
      fallbackData = legacyFallbackResult.data ?? [];
      fallbackError = legacyFallbackResult.error;
    }
    if (!fallbackError) serverRows = fallbackData as JurisReferenceRow[];
  }

  const serverMatches = serverRows
    .map((reference) => ({
      reference,
      score: scorePrivateReference(reference, queryTerms, matter, documentType),
    }))
    .filter(({ reference, score }) => score >= 10 || reference.is_default)
    .map(({ reference, score }) => toPrivateDraftingMatch(reference, score, queryTerms, matter));

  const matchesById = new Map<string, DraftingExampleMatch>();
  [...serverMatches, ...cachedMatches]
    .sort((left, right) => right.sourcePriority - left.sourcePriority || right.score - left.score)
    .forEach((match) => {
      if (!matchesById.has(match.id)) matchesById.set(match.id, match);
    });

  const preference = preferenceResult.data as JurisPreferenceRow | null;
  const preferences = !preferenceResult.error && preference ? {
    responseTone: preference.response_tone ?? 'formal',
    customInstructions: (preference.custom_instructions ?? '').slice(0, 2_000),
  } : null;

  const matches = [...matchesById.values()]
    .sort((left, right) => right.score - left.score || right.sourcePriority - left.sourcePriority)
    .slice(0, 3);
  return { preferences, matches };
};

export interface LegalLibraryResult {
  chunk_id: number;
  source_slug: string;
  source_title: string;
  short_name: string;
  jurisdiction: 'federal' | 'nacional' | 'coahuila';
  article_reference?: string | null;
  heading?: string | null;
  content: string;
  citation_label: string;
  official_document_url: string;
  version_label: string;
  last_reform_date?: string | null;
  rank: number;
}

export interface ExtractedDocumentEvidence {
  attachmentId: string;
  fileName: string;
  fileType: string;
  status: 'ready' | 'needs_ocr' | 'unsupported' | 'failed' | 'pending';
  extractionMethod?: string | null;
  pageCount?: number | null;
  excerpt: string;
  errorMessage?: string | null;
}

export interface ProcessStageEvidence {
  source: 'movimiento' | 'documento' | 'expediente';
  label: string;
  date?: string | null;
  excerpt: string;
}

export interface ProcessStageAnalysis {
  suggestedStage: string;
  confidence: number;
  reasoning: string;
  evidence: ProcessStageEvidence[];
  requiresLawyerConfirmation: boolean;
  documents: ExtractedDocumentEvidence[];
}

const stageRules = [
  {
    stage: 'impugnacion o segunda instancia',
    terms: ['apelacion', 'agravio', 'recurso de revocacion', 'recurso de queja', 'segunda instancia'],
  },
  {
    stage: 'sentencia o resolucion',
    terms: ['sentencia definitiva', 'sentencia interlocutoria', 'resolucion definitiva', 'laudo', 'fallo'],
  },
  {
    stage: 'alegatos y cierre de instruccion',
    terms: ['alegatos', 'citacion para sentencia', 'cierre de instruccion'],
  },
  {
    stage: 'etapa probatoria',
    terms: ['desahogo de pruebas', 'periodo probatorio', 'prueba pericial', 'prueba testimonial', 'prueba confesional'],
  },
  {
    stage: 'etapa postulatoria',
    terms: ['contestacion de demanda', 'reconvencion', 'emplazamiento', 'demanda admitida'],
  },
  {
    stage: 'inicio y radicacion',
    terms: ['radicacion', 'auto de admision', 'admision de demanda', 'presentacion de demanda'],
  },
] as const;

const criminalStageRules = [
  {
    stage: 'impugnacion penal',
    terms: ['apelacion', 'revocacion', 'amparo', 'agravios'],
  },
  {
    stage: 'juicio oral',
    terms: ['juicio oral', 'tribunal de enjuiciamiento', 'auto de apertura', 'fallo condenatorio', 'fallo absolutorio'],
  },
  {
    stage: 'etapa intermedia',
    terms: ['audiencia intermedia', 'acusacion', 'descubrimiento probatorio', 'acuerdos probatorios'],
  },
  {
    stage: 'investigacion complementaria',
    terms: ['vinculacion a proceso', 'plazo de investigacion', 'investigacion complementaria'],
  },
  {
    stage: 'investigacion inicial',
    terms: ['control de detencion', 'formulacion de imputacion', 'orden de aprehension', 'carpeta de investigacion'],
  },
] as const;

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

const compactText = (value: string) => value
  .replace(/\s+/g, ' ')
  .trim();

const getRelevantExcerpt = (text: string, terms: string[], maximum = 3_500) => {
  const compact = compactText(text);
  if (compact.length <= maximum) return compact;

  const normalized = normalizeSearchText(compact);
  const matchIndexes = terms
    .map((term) => normalized.indexOf(normalizeSearchText(term)))
    .filter((index) => index >= 0)
    .slice(0, 4);

  if (matchIndexes.length === 0) {
    const beginning = compact.slice(0, Math.floor(maximum * 0.65));
    const ending = compact.slice(-Math.floor(maximum * 0.3));
    return `${beginning}\n[...]\n${ending}`;
  }

  const radius = Math.max(300, Math.floor(maximum / matchIndexes.length / 2));
  return matchIndexes
    .map((index) => compact.slice(Math.max(0, index - radius), Math.min(compact.length, index + radius)))
    .join('\n[...]\n')
    .slice(0, maximum);
};

const listExpedienteAttachments = async (
  despachoId: string,
  expedienteId: string,
): Promise<DocumentAttachment[]> => {
  const { data: movementRows, error: movementError } = await supabase
    .from('movimientos')
    .select('id')
    .eq('despacho_id', despachoId)
    .eq('expediente_id', expedienteId);
  if (movementError) throw movementError;

  const movementIds = (movementRows ?? []).map((movement) => movement.id);
  const attachmentQueries = [
    supabase
      .from('document_adjuntos')
      .select('*')
      .eq('despacho_id', despachoId)
      .eq('expediente_id', expedienteId)
      .order('created_at'),
  ];

  if (movementIds.length > 0) {
    attachmentQueries.push(
      supabase
        .from('document_adjuntos')
        .select('*')
        .eq('despacho_id', despachoId)
        .in('movimiento_id', movementIds)
        .order('created_at'),
    );
  }

  const results = await Promise.all(attachmentQueries);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const byId = new Map<string, DocumentAttachment>();
  for (const result of results) {
    for (const attachment of (result.data ?? []) as DocumentAttachment[]) {
      byId.set(attachment.id, attachment);
    }
  }
  return [...byId.values()];
};

const readCachedExtraction = async (attachmentId: string) => {
  const { data, error } = await supabase
    .from('document_extractions')
    .select('status,extraction_method,extracted_text,page_count,sha256,error_message,processed_at')
    .eq('attachment_id', attachmentId)
    .maybeSingle();

  if (error && error.code !== 'PGRST205' && error.code !== '42P01') throw error;
  return data;
};

const extractAndCacheAttachment = async (attachment: DocumentAttachment) => {
  const cached = await readCachedExtraction(attachment.id);
  if (cached && ['ready', 'needs_ocr', 'unsupported'].includes(cached.status)) {
    return cached;
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from('despacho-document-files')
    .createSignedUrl(attachment.storage_path, 5 * 60);
  if (signedUrlError || !signedUrl?.signedUrl) {
    throw signedUrlError ?? new Error('No se pudo abrir el documento.');
  }

  const result = await extractBrowserDocumentText({
    url: signedUrl.signedUrl,
    fileName: attachment.file_name,
    fileType: attachment.file_type,
  });
  const { data: { user } } = await supabase.auth.getUser();

  const extraction = {
    attachment_id: attachment.id,
    despacho_id: attachment.despacho_id,
    expediente_id: attachment.expediente_id ?? null,
    movimiento_id: attachment.movimiento_id ?? null,
    status: result.status,
    extraction_method: result.extractionMethod ?? null,
    extracted_text: result.extractedText ?? '',
    page_count: result.pageCount ?? null,
    sha256: result.sha256 ?? null,
    error_message: result.errorMessage ?? null,
    processed_by: user?.id ?? null,
    processed_at: new Date().toISOString(),
  };

  if (user) {
    const { error } = await supabase
      .from('document_extractions')
      .upsert(extraction, { onConflict: 'attachment_id' });
    if (error && error.code !== 'PGRST205' && error.code !== '42P01') throw error;
  }

  return extraction;
};

export const readExpedienteDocuments = async ({
  despachoId,
  expedienteId,
  searchTerms = [],
  limit = 8,
}: {
  despachoId: string;
  expedienteId: string;
  searchTerms?: string[];
  limit?: number;
}): Promise<ExtractedDocumentEvidence[]> => {
  const attachments = await listExpedienteAttachments(despachoId, expedienteId);
  const selected = attachments.slice(0, Math.max(1, Math.min(limit, 12)));
  const extractions: ExtractedDocumentEvidence[] = [];

  for (const attachment of selected) {
    try {
      const extraction = await extractAndCacheAttachment(attachment);
      extractions.push({
        attachmentId: attachment.id,
        fileName: attachment.file_name,
        fileType: attachment.file_type,
        status: extraction.status as ExtractedDocumentEvidence['status'],
        extractionMethod: extraction.extraction_method,
        pageCount: extraction.page_count,
        excerpt: extraction.status === 'ready'
          ? getRelevantExcerpt(extraction.extracted_text ?? '', searchTerms)
          : '',
        errorMessage: extraction.error_message,
      });
    } catch (error) {
      extractions.push({
        attachmentId: attachment.id,
        fileName: attachment.file_name,
        fileType: attachment.file_type,
        status: 'failed',
        excerpt: '',
        errorMessage: error instanceof Error ? error.message : 'No se pudo leer el documento.',
      });
    }
  }

  return extractions;
};

export const searchLegalLibrary = async ({
  query,
  materia,
  jurisdiction,
  limit = 8,
}: {
  query: string;
  materia?: string;
  jurisdiction?: string;
  limit?: number;
}): Promise<LegalLibraryResult[]> => {
  const { data, error } = await supabase.rpc('search_legal_library', {
    search_text: query,
    materia_filter: materia || null,
    jurisdiction_filter: jurisdiction || null,
    result_limit: Math.max(1, Math.min(limit, 20)),
  });

  if (error) throw error;
  return (data ?? []) as LegalLibraryResult[];
};

const findRuleEvidence = (
  value: string,
  rules: readonly { stage: string; terms: readonly string[] }[],
) => {
  const normalized = normalizeSearchText(value);
  for (const rule of rules) {
    const matchedTerm = rule.terms.find((term) => normalized.includes(normalizeSearchText(term)));
    if (matchedTerm) return { rule, matchedTerm };
  }
  return null;
};

export const analyzeProcessStage = async ({
  despachoId,
  expediente,
}: {
  despachoId: string;
  expediente: Expediente;
}): Promise<ProcessStageAnalysis> => {
  const { data: movementRows, error: movementError } = await supabase
    .from('movimientos')
    .select('id,fecha,tipo,descripcion,created_at')
    .eq('despacho_id', despachoId)
    .eq('expediente_id', expediente.id)
    .order('fecha', { ascending: false });
  if (movementError) throw movementError;

  const movements = (movementRows ?? []) as Movimiento[];
  const rules = normalizeSearchText(expediente.materia ?? '').includes('penal')
    ? criminalStageRules
    : stageRules;
  const allTerms = rules.flatMap((rule) => [...rule.terms]);
  const documents = await readExpedienteDocuments({
    despachoId,
    expedienteId: expediente.id,
    searchTerms: allTerms,
  });

  const evidence: ProcessStageEvidence[] = [];
  for (const movement of movements) {
    const match = findRuleEvidence(`${movement.tipo} ${movement.descripcion}`, rules);
    if (!match) continue;
    evidence.push({
      source: 'movimiento',
      label: `${movement.tipo} (${match.matchedTerm})`,
      date: movement.fecha,
      excerpt: getRelevantExcerpt(movement.descripcion, [match.matchedTerm], 900),
    });
  }

  for (const document of documents) {
    if (document.status !== 'ready') continue;
    const match = findRuleEvidence(document.excerpt, rules);
    if (!match) continue;
    evidence.push({
      source: 'documento',
      label: `${document.fileName} (${match.matchedTerm})`,
      excerpt: getRelevantExcerpt(document.excerpt, [match.matchedTerm], 1_200),
    });
  }

  const strongestText = [
    ...movements.map((movement) => `${movement.tipo} ${movement.descripcion}`),
    ...documents.filter((document) => document.status === 'ready').map((document) => document.excerpt),
  ].join(' ');
  const strongestMatch = findRuleEvidence(strongestText, rules);

  if (!strongestMatch) {
    return {
      suggestedStage: 'etapa no determinada',
      confidence: 0.2,
      reasoning: 'Los movimientos y documentos legibles no contienen evidencia suficiente para identificar una etapa procesal.',
      evidence: [{
        source: 'expediente',
        label: 'Datos generales',
        excerpt: `${expediente.numero_expediente}; ${expediente.materia ?? 'materia no indicada'}; estatus ${expediente.estatus}.`,
      }],
      requiresLawyerConfirmation: true,
      documents,
    };
  }

  const movementEvidence = evidence.filter((item) => item.source === 'movimiento').length;
  const documentEvidence = evidence.filter((item) => item.source === 'documento').length;
  const confidence = Math.min(0.86, 0.52 + Math.min(movementEvidence, 2) * 0.11 + Math.min(documentEvidence, 2) * 0.06);

  return {
    suggestedStage: strongestMatch.rule.stage,
    confidence,
    reasoning: `La etapa se sugiere por coincidencias documentales con "${strongestMatch.matchedTerm}". Es una clasificacion auxiliar, no una determinacion jurisdiccional.`,
    evidence: evidence.slice(0, 10),
    requiresLawyerConfirmation: true,
    documents,
  };
};

export const prepareLegalDraftContext = async ({
  despachoId,
  expediente,
  documentType,
  subject,
}: {
  despachoId: string;
  expediente: Expediente;
  documentType: string;
  subject: string;
}) => {
  const stage = await analyzeProcessStage({ despachoId, expediente });
  const matter = expediente.materia?.toLocaleLowerCase('es-MX') ?? '';
  const legalResults = await searchLegalLibrary({
    query: [documentType, subject, matter].filter(Boolean).join(' '),
    materia: matter || undefined,
    limit: 4,
  });
  const localDraftingExamples = findDraftingExamples({
    documentType,
    subject,
    matter,
    limit: 1,
  });
  const remoteDraftingExamples = await searchRemoteDraftingExamples({
    documentType,
    matter,
  });
  const personalization = await searchJurisPersonalization({
    despachoId,
    query: `${documentType} ${subject}`,
    matter,
  });
  const platformDraftingExamples = remoteDraftingExamples.length > 0
    ? remoteDraftingExamples
    : localDraftingExamples;
  const draftingExamples = [...personalization.matches, ...platformDraftingExamples]
    .sort((left, right) => right.sourcePriority - left.sourcePriority || right.score - left.score)
    .slice(0, 4);
  const selectedDraftingReference = personalization.matches[0] ?? platformDraftingExamples[0] ?? null;

  return {
    expediente,
    processStage: {
      ...stage,
      evidence: stage.evidence.slice(0, 5),
      documents: stage.documents.slice(0, 3).map((document) => ({
        ...document,
        excerpt: document.excerpt.slice(0, 850),
      })),
    },
    legalSources: legalResults.slice(0, 3).map((result) => ({
      ...result,
      content: result.content.slice(0, 1_000),
    })),
    draftingExamples,
    selectedDraftingReference,
    jurisPersonalization: personalization.preferences,
    referenceHierarchy: {
      policy: 'private-first',
      primarySource: selectedDraftingReference?.source ?? null,
      privateMatches: personalization.matches.map((match) => ({ id: match.id, title: match.title, score: match.score })),
      platformMatches: platformDraftingExamples.map((match) => ({ id: match.id, title: match.title, score: match.score })),
      explanation: personalization.matches.length > 0
        ? 'Se eligio primero un formato privado del despacho. La biblioteca general solo complementa.'
        : 'No hubo formato privado coincidente. Se uso la biblioteca general como referencia supletoria.',
    },
    draftingRules: [
      'Usar exclusivamente hechos presentes en los datos y documentos recuperados.',
      'Marcar entre corchetes todo dato faltante; no inventar fechas, autoridades, resoluciones ni notificaciones.',
      'Citar cada fundamento con la etiqueta proporcionada y conservar el enlace oficial.',
      selectedDraftingReference
        ? `FORMATO PRIMARIO (${selectedDraftingReference.source === 'private' ? 'PRIVADO DEL DESPACHO' : 'SUPLETORIO DE JUDICIAL'}): ${selectedDraftingReference.title}. ${selectedDraftingReference.selectionReason} Sigue el orden: ${selectedDraftingReference.structure.join(' > ') || 'encabezado > comparecencia > desarrollo > petitorios > protesto'}.`
        : 'NO HAY FORMATO VALIDADO para este encargo. No redactes un escrito completo ni inventes una estructura generica: solicita que se seleccione o cargue un formato de referencia.',
      'JERARQUIA OBLIGATORIA: formato privado coincidente > datos y documentos del expediente > biblioteca general de Judicial. La biblioteca general nunca sustituye un formato privado seleccionado.',
      'Usar el formato seleccionado como referencia de estructura, tono, apartados y orden argumentativo.',
      'No copiar nombres, domicilios, expedientes, fechas o hechos de los ejemplos. Los ejemplos estan sanitizados y representan supuestos distintos.',
      'Verificar procedencia, plazo, legitimacion, resolucion impugnada y autoridad competente antes de presentar.',
      'El resultado es un borrador editable sujeto a revision y firma de un profesional del derecho.',
    ],
  };
};
