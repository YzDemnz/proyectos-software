import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  DownloadCloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  LockKeyhole,
  Power,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import JurisFace from './JurisFace';
import {
  findInstalledJurisAIProfile,
  getBestGpuVram,
  getRecommendedJurisAIModel,
  isOllamaModelMatch,
  JURIS_AI_CUSTOM_MODEL_KEY,
  JURIS_AI_ENDPOINT,
  JURIS_AI_MODEL_KEY,
  JURIS_AI_MODELS,
  JURIS_AI_PORTAL_GUIDE_URL,
  OLLAMA_LEGACY_MAC_DOWNLOAD_URL,
  normalizeJurisAIProfileId,
  pickInstalledOllamaModelName,
  setJurisAIEnabled,
  type HardwareProfile,
  type JurisAIModelProfile,
  type JurisAIProfileId,
} from '../lib/jurisAI';
import {
  getAutomaticModelUpdatesEnabled,
  JURIS_LAST_MODEL_DEPLOYMENT_KEY,
  loadResolvedAIModelDeployment,
  setAutomaticModelUpdatesEnabled,
  subscribeAIModelDeployments,
  type AIModelDeployment,
} from '../lib/aiModelDeployments';
import type { JurisTarget } from '../lib/jurisKnowledge';
import {
  createJurisPendingAction,
  executeJurisMutationTool,
  executeJurisReadTool,
  getJurisToolDefinitions,
  isJurisMutationTool,
  type JurisPendingAction,
  type JurisToolCall,
  type JurisToolContext,
} from '../lib/jurisTools';

interface JurisAIProps {
  aiEnabled: boolean;
  despachoId: string;
  despachoName: string;
  canEdit: boolean;
  onAIEnabledChange: (enabled: boolean) => void;
  onNavigate: (section: JurisTarget) => void;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

interface OllamaMessage {
  role: 'system' | 'assistant' | 'user' | 'tool';
  content: string;
  tool_calls?: JurisToolCall[];
  tool_name?: string;
}

interface OllamaResponse {
  message?: {
    role?: 'assistant';
    content?: string;
    tool_calls?: JurisToolCall[];
  };
}

type EngineStatus = 'checking' | 'offline' | 'missing-model' | 'ready';

const fallbackHardwareProfile = (): HardwareProfile => {
  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    platform: window.judicialDesktop?.platform ?? navigator.platform,
    macOSVersion: null,
    macOSMajor: null,
    legacyOllama: false,
    totalMemoryGb: nav.deviceMemory ?? 0,
    cpuModel: 'Equipo local',
    cpuCores: Math.max(1, Math.round((navigator.hardwareConcurrency ?? 2) / 2)),
    cpuThreads: navigator.hardwareConcurrency ?? 2,
    gpus: [],
  };
};

const formatHardwareValue = (value: number) => (value > 0 ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} GB` : 'No disponible');

const getModelById = (models: JurisAIModelProfile[], id: JurisAIProfileId) => (
  models.find((model) => model.id === id) ?? models[1] ?? models[0] ?? JURIS_AI_MODELS[1]
);

const createDetectedModelProfile = (modelName: string): JurisAIModelProfile => {
  const matchedProfile = JURIS_AI_MODELS.find((profile) => isOllamaModelMatch(modelName, profile.model));

  return {
    ...(matchedProfile ?? JURIS_AI_MODELS[0]),
    label: matchedProfile?.label ?? 'Modelo detectado',
    model: modelName,
    shortName: matchedProfile ? `${matchedProfile.shortName} local` : 'Modelo local',
    description: matchedProfile
      ? `Modelo local detectado: ${modelName}.`
      : 'Modelo instalado localmente y detectado automáticamente por Judicial.',
    bestFor: matchedProfile?.bestFor ?? ['uso local', 'redacción asistida', 'consultas del despacho'],
  };
};

const requestOllamaChat = async ({
  model,
  messages,
  tools,
}: {
  model: string;
  messages: OllamaMessage[];
  tools: ReturnType<typeof getJurisToolDefinitions>;
}) => {
  const sendRequest = async (includeTools: boolean) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`${JURIS_AI_ENDPOINT}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: '30m',
          messages,
          ...(includeTools ? { tools } : {}),
        }),
      });

      if (response.ok) {
        return { data: (await response.json()) as OllamaResponse, usedTools: includeTools };
      }

      const detail = (await response.text()).trim();
      const unsupportedTools = /tool|function|unsupported|unknown field|invalid.*schema/i.test(detail);
      if (includeTools && unsupportedTools) return sendRequest(false);
      throw new Error(detail || `Ollama respondió con ${response.status}.`);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  return sendRequest(tools.length > 0);
};

const createAssistantMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  content,
});

const buildJurisSystemPrompt = (context: JurisToolContext) => [
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

const normalizeIntentText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

const getExpedienteReferenceFromPrompt = (prompt: string) => {
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

const getMandatoryPreflight = (prompt: string) => {
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

const getDraftingReference = (result: unknown): SelectedDraftingReference | null => {
  if (!result || typeof result !== 'object') return null;
  const response = result as {
    ok?: boolean;
    data?: { selectedDraftingReference?: SelectedDraftingReference | null };
  };
  const reference = response.data?.selectedDraftingReference;
  return response.ok && reference?.title ? reference : null;
};

const hasDraftingReference = (result: unknown) => Boolean(getDraftingReference(result));

const validateDraftResponse = (content: string, reference: SelectedDraftingReference) => {
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

export default function JurisAI({
  aiEnabled,
  despachoId,
  despachoName,
  canEdit,
  onAIEnabledChange,
  onNavigate,
}: JurisAIProps) {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [localOllamaState, setLocalOllamaState] = useState<OllamaState | null>(null);
  const [catalogModels, setCatalogModels] = useState<JurisAIModelProfile[]>(JURIS_AI_MODELS);
  const [modelInstallState, setModelInstallState] = useState<JurisModelInstallState | null>(null);
  const [remoteDeployment, setRemoteDeployment] = useState<AIModelDeployment | null>(null);
  const [automaticModelUpdates, setAutomaticModelUpdates] = useState(getAutomaticModelUpdatesEnabled);
  const [appVersion, setAppVersion] = useState('0.0.0');
  const [selectedModelId, setSelectedModelId] = useState<JurisAIProfileId>(() => {
    return normalizeJurisAIProfileId(window.localStorage.getItem(JURIS_AI_MODEL_KEY)) ?? 'medium';
  });
  const [detectedModelName, setDetectedModelName] = useState<string | null>(() => {
    return window.localStorage.getItem(JURIS_AI_CUSTOM_MODEL_KEY);
  });
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('checking');
  const [engineMessage, setEngineMessage] = useState('Revisando motor local...');
  const [messages, setMessages] = useState<ChatMessage[]>([
    createAssistantMessage(
      'Juris IA esta conectado al despacho actual. Puedo consultar expedientes, movimientos, clientes y agenda, ademas de preparar citas y cambios que siempre te pedire confirmar.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activityMessage, setActivityMessage] = useState('Juris IA está preparando el modelo local. El primer mensaje puede tardar hasta un minuto.');
  const [pendingAction, setPendingAction] = useState<JurisPendingAction | null>(null);
  const [executingAction, setExecutingAction] = useState(false);
  const [selectingOllamaLocation, setSelectingOllamaLocation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const automaticInstallAttemptRef = useRef<string | null>(null);

  const isLegacyMacOllama = Boolean(hardware?.legacyOllama || localOllamaState?.legacyMacOS);
  const selectedModel = useMemo(() => {
    if (detectedModelName) return createDetectedModelProfile(detectedModelName);
    return isLegacyMacOllama ? catalogModels[0] ?? JURIS_AI_MODELS[0] : getModelById(catalogModels, selectedModelId);
  }, [catalogModels, detectedModelName, isLegacyMacOllama, selectedModelId]);
  const deploymentModel = useMemo(() => (
    remoteDeployment ? getModelById(catalogModels, remoteDeployment.model_id) : null
  ), [catalogModels, remoteDeployment]);
  const visibleModels = (isLegacyMacOllama || detectedModelName) ? [selectedModel] : catalogModels;
  const ollamaDownloadUrl = isLegacyMacOllama
    ? localOllamaState?.legacyDownloadUrl ?? OLLAMA_LEGACY_MAC_DOWNLOAD_URL
    : window.judicialDesktop?.platform === 'darwin'
      ? 'https://ollama.com/download/mac'
      : 'https://ollama.com/download/windows';
  const bestGpuVram = getBestGpuVram(hardware);
  const isInstallingModel = modelInstallState?.status === 'starting' || modelInstallState?.status === 'downloading';
  const isSelectedModelInstalling = isInstallingModel && modelInstallState?.modelId === selectedModel.id;
  const deploymentInstalledModelName = deploymentModel
    ? (localOllamaState?.models ?? []).find((modelName) => isOllamaModelMatch(modelName, deploymentModel.model)) ?? null
    : null;
  const lastAppliedDeploymentId = window.localStorage.getItem(JURIS_LAST_MODEL_DEPLOYMENT_KEY);
  const toolContext = useMemo<JurisToolContext>(() => ({
    despachoId,
    despachoName,
    canEdit,
  }), [canEdit, despachoId, despachoName]);
  const toolDefinitions = useMemo(() => getJurisToolDefinitions(canEdit), [canEdit]);

  const rememberDetectedModel = useCallback((modelName: string | null) => {
    setDetectedModelName(modelName);
    if (modelName) {
      window.localStorage.setItem(JURIS_AI_CUSTOM_MODEL_KEY, modelName);
    } else {
      window.localStorage.removeItem(JURIS_AI_CUSTOM_MODEL_KEY);
    }
  }, []);

  const loadHardware = useCallback(async () => {
    const profile = await window.judicialDesktop?.getHardwareProfile?.().catch(() => null);
    const nextProfile = profile ?? fallbackHardwareProfile();
    setHardware(nextProfile);

    if (nextProfile.legacyOllama) {
      setSelectedModelId('low');
      window.localStorage.setItem(JURIS_AI_MODEL_KEY, 'low');
      return;
    }

    const hasSavedModel = Boolean(window.localStorage.getItem(JURIS_AI_MODEL_KEY));
    if (!hasSavedModel) {
      const recommended = getRecommendedJurisAIModel(nextProfile);
      setSelectedModelId(recommended.id);
      window.localStorage.setItem(JURIS_AI_MODEL_KEY, recommended.id);
    }
  }, []);

  const applyOllamaState = useCallback((state: OllamaState, model: JurisAIModelProfile) => {
    setLocalOllamaState(state);
    const installedModels = state.models ?? [];
    const installedProfile = findInstalledJurisAIProfile(installedModels);
    const preferredModel = window.localStorage.getItem(JURIS_AI_CUSTOM_MODEL_KEY)?.trim();
    const autoDetectedModel = installedModels.find((name) => (
      preferredModel ? isOllamaModelMatch(name, preferredModel) : false
    )) ?? pickInstalledOllamaModelName(installedModels);
    const modelInstalled = installedModels.some((name) => isOllamaModelMatch(name, model.model));

    if (state.status === 'ready' && autoDetectedModel) {
      if (installedProfile && !isLegacyMacOllama) {
        rememberDetectedModel(autoDetectedModel);
        if (installedProfile.id !== selectedModelId) {
          setSelectedModelId(installedProfile.id);
          window.localStorage.setItem(JURIS_AI_MODEL_KEY, installedProfile.id);
        }
        setEngineStatus('ready');
        setEngineMessage(`Motor local listo con ${autoDetectedModel}.`);
        return;
      }

      rememberDetectedModel(autoDetectedModel);
      if (isLegacyMacOllama && selectedModelId !== 'low') {
        setSelectedModelId('low');
        window.localStorage.setItem(JURIS_AI_MODEL_KEY, 'low');
      }
      setEngineStatus('ready');
      setEngineMessage(`Motor local listo con ${autoDetectedModel}.`);
      return;
    }

    if (state.status === 'ready' && modelInstalled) {
      rememberDetectedModel(autoDetectedModel ?? model.model);
      setEngineStatus('ready');
      setEngineMessage(`Motor local listo con ${autoDetectedModel ?? model.model}.`);
      return;
    }

    if (state.running && !modelInstalled) {
      setEngineStatus('missing-model');
      setEngineMessage(`Ollama esta instalado, pero falta descargar ${model.model}.`);
      return;
    }

    setEngineStatus('offline');
    setEngineMessage(state.message || 'No se encontro Ollama activo en esta computadora.');
  }, [isLegacyMacOllama, rememberDetectedModel, selectedModelId]);

  const checkEngine = useCallback(async (model: JurisAIModelProfile) => {
    setEngineStatus('checking');
    setEngineMessage('Revisando Ollama local...');

    try {
      if (window.judicialDesktop?.checkOllamaStatus) {
        const state = await window.judicialDesktop.checkOllamaStatus();
        applyOllamaState(state, model);
        return;
      }

      const response = await fetch(`${JURIS_AI_ENDPOINT}/api/tags`);
      if (!response.ok) throw new Error('No se pudo leer el catalogo local.');

      const data = (await response.json()) as { models?: Array<{ name?: string }> };
      const installedModels = data.models?.map((item) => item.name ?? '') ?? [];
      const modelInstalled = installedModels.some((name) => isOllamaModelMatch(name, model.model));
      const autoDetectedModel = pickInstalledOllamaModelName(installedModels);

      if (autoDetectedModel && !modelInstalled) {
        rememberDetectedModel(autoDetectedModel);
        setEngineStatus('ready');
        setEngineMessage(`Motor local listo con ${autoDetectedModel}.`);
        return;
      }

      if (!modelInstalled) {
        setEngineStatus('missing-model');
        setEngineMessage(`Ollama esta instalado, pero falta descargar ${model.model}.`);
        return;
      }

      rememberDetectedModel(autoDetectedModel ?? model.model);
      setEngineStatus('ready');
      setEngineMessage(`Motor local listo con ${autoDetectedModel ?? model.model}.`);
    } catch {
      setEngineStatus('offline');
      setEngineMessage('No se encontro Ollama activo en esta computadora.');
    }
  }, [applyOllamaState, rememberDetectedModel]);

  const refreshModelDeployment = useCallback(async () => {
    if (!hardware) return;
    const recommendedTier = isLegacyMacOllama
      ? 'low'
      : getRecommendedJurisAIModel(hardware).id;
    const deployment = await loadResolvedAIModelDeployment({
      recommendedTier,
      platform: window.judicialDesktop?.platform ?? hardware.platform,
      appVersion,
    });
    setRemoteDeployment(deployment);
  }, [appVersion, hardware, isLegacyMacOllama]);

  const selectOllamaLocation = async () => {
    if (!window.judicialDesktop?.selectOllamaLocation) {
      setEngineMessage('La selección de ubicación está disponible en la aplicación de escritorio.');
      return;
    }

    setSelectingOllamaLocation(true);
    try {
      const result = await window.judicialDesktop.selectOllamaLocation();
      if (!result.ok) {
        if (!result.canceled) setEngineMessage(result.message ?? 'No se pudo usar esa ubicación de Ollama.');
        return;
      }

      if (result.state) {
        applyOllamaState(result.state, selectedModel);
      } else {
        await checkEngine(selectedModel);
      }
    } catch {
      setEngineMessage('No se pudo abrir el selector de ubicación de Ollama.');
    } finally {
      setSelectingOllamaLocation(false);
    }
  };

  const clearOllamaLocation = async () => {
    if (!window.judicialDesktop?.clearOllamaLocation) return;

    setSelectingOllamaLocation(true);
    try {
      const result = await window.judicialDesktop.clearOllamaLocation();
      if (result.state) applyOllamaState(result.state, selectedModel);
    } finally {
      setSelectingOllamaLocation(false);
    }
  };

  useEffect(() => {
    loadHardware().catch(() => setHardware(fallbackHardwareProfile()));
  }, [loadHardware]);

  useEffect(() => {
    window.judicialDesktop?.getAppUpdateState?.()
      .then((state) => setAppVersion(state.currentVersion || '0.0.0'))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    window.judicialDesktop?.getJurisModelCatalog?.()
      .then((catalog) => {
        if (!mounted || !catalog.models.length) return;
        setCatalogModels(catalog.models.map((model) => ({
          ...model,
          approximateDownload: model.approximateDownload ?? undefined,
          license: model.license ?? undefined,
          officialPage: model.officialPage ?? undefined,
        })));
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLegacyMacOllama) return;
    if (selectedModelId === 'low') return;
    setSelectedModelId('low');
    window.localStorage.setItem(JURIS_AI_MODEL_KEY, 'low');
  }, [isLegacyMacOllama, selectedModelId]);

  useEffect(() => {
    window.localStorage.setItem(JURIS_AI_MODEL_KEY, selectedModelId);
    checkEngine(selectedModel).catch(() => undefined);
  }, [checkEngine, selectedModel, selectedModelId]);

  useEffect(() => {
    const unsubscribe = window.judicialDesktop?.onOllamaStatus?.((state) => {
      applyOllamaState(state, selectedModel);
    });

    return () => unsubscribe?.();
  }, [applyOllamaState, selectedModel]);

  useEffect(() => {
    const unsubscribe = window.judicialDesktop?.onJurisModelInstallStatus?.((state) => {
      setModelInstallState(state);
      if (state.status === 'completed') {
        checkEngine(selectedModel).catch(() => undefined);
      }
    });

    return () => unsubscribe?.();
  }, [checkEngine, selectedModel]);

  useEffect(() => {
    refreshModelDeployment().catch(() => undefined);
    const unsubscribe = subscribeAIModelDeployments(() => {
      refreshModelDeployment().catch(() => undefined);
    });
    return unsubscribe;
  }, [refreshModelDeployment]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const openExternal = (url: string) => {
    if (window.judicialDesktop?.openExternalUrl) {
      window.judicialDesktop.openExternalUrl(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleEnableAI = (enabled: boolean) => {
    setJurisAIEnabled(enabled);
    onAIEnabledChange(enabled);
  };

  const installModelProfile = useCallback(async (
    modelProfile: JurisAIModelProfile,
    deployment?: AIModelDeployment | null,
  ) => {
    if (!window.judicialDesktop?.installJurisModel) {
      setEngineMessage('La instalación asistida está disponible en la aplicación de escritorio.');
      return;
    }

    setSelectedModelId(modelProfile.id);
    rememberDetectedModel(null);
    window.localStorage.setItem(JURIS_AI_MODEL_KEY, modelProfile.id);
    setModelInstallState({
      modelId: modelProfile.id,
      status: 'starting',
      percent: 0,
      message: `Preparando ${modelProfile.shortName}...`,
    });
    const result = await window.judicialDesktop.installJurisModel(modelProfile.id);
    if (result.ok) {
      rememberDetectedModel(modelProfile.model);
      if (deployment) {
        window.localStorage.setItem(JURIS_LAST_MODEL_DEPLOYMENT_KEY, deployment.id);
      }
    }
    if (result.state) applyOllamaState(result.state, modelProfile);
    if (!result.ok && !result.canceled) {
      setEngineMessage(result.message ?? 'No se pudo iniciar la descarga del modelo.');
    }
  }, [applyOllamaState, rememberDetectedModel]);

  const installSelectedModel = async () => {
    await installModelProfile(selectedModel, remoteDeployment);
  };

  const activateDeploymentModel = async () => {
    if (!remoteDeployment || !deploymentModel) return;
    if (!deploymentInstalledModelName) {
      await installModelProfile(deploymentModel, remoteDeployment);
      return;
    }

    setSelectedModelId(deploymentModel.id);
    window.localStorage.setItem(JURIS_AI_MODEL_KEY, deploymentModel.id);
    window.localStorage.setItem(JURIS_LAST_MODEL_DEPLOYMENT_KEY, remoteDeployment.id);
    rememberDetectedModel(deploymentInstalledModelName);
    await checkEngine({ ...deploymentModel, model: deploymentInstalledModelName });
  };

  const changeAutomaticModelUpdates = (enabled: boolean) => {
    if (enabled && !window.confirm(
      'Judicial podrá descargar automáticamente modelos compatibles desde el registro oficial de Ollama cuando exista una versión aprobada para tu equipo. ¿Deseas activarlo?',
    )) return;
    setAutomaticModelUpdatesEnabled(enabled);
    setAutomaticModelUpdates(enabled);
  };

  useEffect(() => {
    if (!automaticModelUpdates || !remoteDeployment?.auto_install_allowed || !deploymentModel) return;
    if (!localOllamaState?.running || isInstallingModel) return;
    if (automaticInstallAttemptRef.current === remoteDeployment.id) return;

    const alreadyInstalled = (localOllamaState.models ?? [])
      .some((modelName) => isOllamaModelMatch(modelName, deploymentModel.model));
    if (alreadyInstalled) {
      setSelectedModelId(deploymentModel.id);
      window.localStorage.setItem(JURIS_AI_MODEL_KEY, deploymentModel.id);
      rememberDetectedModel(
        (localOllamaState.models ?? []).find((modelName) => isOllamaModelMatch(modelName, deploymentModel.model))
          ?? deploymentModel.model,
      );
      window.localStorage.setItem(JURIS_LAST_MODEL_DEPLOYMENT_KEY, remoteDeployment.id);
      return;
    }

    automaticInstallAttemptRef.current = remoteDeployment.id;
    installModelProfile(deploymentModel, remoteDeployment).catch(() => undefined);
  }, [
    automaticModelUpdates,
    deploymentModel,
    isInstallingModel,
    localOllamaState,
    remoteDeployment,
    installModelProfile,
    rememberDetectedModel,
  ]);

  const cancelModelInstall = async () => {
    await window.judicialDesktop?.cancelJurisModelInstall?.();
  };

  const sendPrompt = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || sending || pendingAction) return;

    if (!aiEnabled || engineStatus !== 'ready') {
      setMessages((current) => [
        ...current,
        createAssistantMessage(
          !aiEnabled
            ? 'Activa Juris IA antes de enviar una consulta.'
            : `${engineMessage} Revisa el motor local y vuelve a intentarlo.`,
        ),
      ]);
      return;
    }

    const normalizedIntent = normalizeIntentText(trimmed);
    const asksForFullDraft = /(crea|redacta|elabora|prepara|haz|genera)/.test(normalizedIntent)
      && /(escrito|apelacion|amparo|contestacion|demanda|alegatos|promocion|incidente|recurso|queja)/.test(normalizedIntent);
    if (asksForFullDraft && !getExpedienteReferenceFromPrompt(trimmed)) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: trimmed },
        createAssistantMessage('Para preparar un escrito basado en referencias reales, indícame primero el número de expediente. Después elegiré el formato coincidente; si no existe, te pediré cargarlo en Configuración > Personaliza a Juris.'),
      ]);
      setInput('');
      return;
    }

    const nextUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setActivityMessage('Juris IA está preparando el modelo local. El primer mensaje puede tardar hasta un minuto.');

    try {
      const ollamaMessages: OllamaMessage[] = [
        { role: 'system', content: buildJurisSystemPrompt(toolContext) },
        ...nextMessages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];

      let selectedDraftingReference: SelectedDraftingReference | null = null;
      const mandatoryPreflight = getMandatoryPreflight(trimmed);
      if (mandatoryPreflight) {
        setActivityMessage(mandatoryPreflight.activity);
        const preflightResult = await executeJurisReadTool(
          mandatoryPreflight.toolName,
          mandatoryPreflight.arguments,
          toolContext,
        );
        ollamaMessages.push({
          role: 'system',
          content: [
            `La aplicacion ejecuto obligatoriamente ${mandatoryPreflight.toolName} antes de responder.`,
            `Resultado: ${JSON.stringify(preflightResult)}`,
            preflightResult.ok
              ? 'Usa este contexto como fuente. No agregues hechos ni articulos que no aparezcan en el resultado.'
              : 'La consulta fallo o el expediente no existe. Explicalo claramente y no redactes con datos inventados.',
          ].join('\n'),
        });

        if (mandatoryPreflight.toolName === 'preparar_contexto_escrito') {
          selectedDraftingReference = getDraftingReference(preflightResult);
          if (!hasDraftingReference(preflightResult)) {
            setMessages((current) => [
              ...current,
              createAssistantMessage('No preparé un escrito genérico porque no encontré un formato que coincida con lo solicitado. Precisa el tipo de escrito o agrega un formato privado en Configuración > Personaliza a Juris.'),
            ]);
            return;
          }
        }
      }

      let finalContent = '';
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const { data, usedTools } = await requestOllamaChat({
          model: detectedModelName || selectedModel.model,
          messages: ollamaMessages,
          tools: toolDefinitions,
        });
        const assistantMessage = data.message;
        const toolCalls = assistantMessage?.tool_calls ?? [];
        finalContent = assistantMessage?.content?.trim() ?? '';

        if (!usedTools && toolCalls.length > 0) {
          finalContent = finalContent || 'El modelo respondió sin herramientas compatibles. Puedes hacer consultas generales, pero las acciones sobre el despacho requieren un modelo compatible.';
        }

        if (toolCalls.length === 0) {
          if (!finalContent && iteration < 4) {
            ollamaMessages.push({
              role: 'system',
              content: 'La respuesta anterior quedo vacia. Responde al usuario o llama la herramienta correcta ahora.',
            });
            continue;
          }
          break;
        }

        ollamaMessages.push({
          role: 'assistant',
          content: finalContent,
          tool_calls: toolCalls,
        });

        let stagedMutation = false;
        for (const call of toolCalls) {
          const toolName = call.function.name;
          const toolArguments = call.function.arguments ?? {};

          if (isJurisMutationTool(toolName)) {
            if (!canEdit) {
              ollamaMessages.push({
                role: 'tool',
                tool_name: toolName,
                content: JSON.stringify({
                  ok: false,
                  summary: 'El usuario tiene permisos de solo lectura.',
                }),
              });
              continue;
            }

            const nextPendingAction = createJurisPendingAction(toolName, toolArguments);
            setPendingAction(nextPendingAction);
            finalContent = 'Preparé la acción solicitada. Revisa los datos y confirma antes de guardarlos.';
            stagedMutation = true;
            break;
          }

          setActivityMessage('Consultando información del despacho...');
          const result = await executeJurisReadTool(toolName, toolArguments, toolContext);
          ollamaMessages.push({
            role: 'tool',
            tool_name: toolName,
            content: JSON.stringify(result),
          });
        }

        if (stagedMutation) break;
        setActivityMessage('Organizando los resultados...');
      }

      if (asksForFullDraft && selectedDraftingReference && finalContent) {
        const validationIssue = validateDraftResponse(finalContent, selectedDraftingReference);
        if (validationIssue) {
          setActivityMessage('Ajustando el borrador al formato seleccionado...');
          const correctionMessages: OllamaMessage[] = [
            ...ollamaMessages,
            { role: 'assistant', content: finalContent },
            {
              role: 'system',
              content: [
                validationIssue,
                `Reescribe el borrador siguiendo el formato "${selectedDraftingReference.title}".`,
                `Respeta estos apartados: ${(selectedDraftingReference.structure ?? []).join(' > ') || 'los apartados recuperados en preparar_contexto_escrito'}.`,
                'No agregues prologos, hechos, autoridades, fechas, articulos ni datos que no esten en el contexto recuperado.',
                'Devuelve solamente el borrador corregido.',
              ].join('\n'),
            },
          ];
          const correction = await requestOllamaChat({
            model: detectedModelName || selectedModel.model,
            messages: correctionMessages,
            tools: [],
          });
          const correctedContent = correction.data.message?.content?.trim() ?? '';
          finalContent = validateDraftResponse(correctedContent, selectedDraftingReference)
            ? 'No entregué el escrito porque el modelo local no respetó el formato seleccionado. Prueba con un modelo de mayor capacidad o revisa la referencia en Configuración > Personaliza a Juris.'
            : correctedContent;
        }
      }

      setMessages((current) => [
        ...current,
        createAssistantMessage(finalContent || 'La consulta termino, pero el modelo no genero un resumen.'),
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Error local no identificado.';
      setMessages((current) => [
        ...current,
        createAssistantMessage(`No pude comunicarme con el modelo local. ${reason} Revisa que Ollama siga abierto y que el modelo esté instalado.`),
      ]);
      checkEngine(selectedModel).catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || executingAction) return;

    setExecutingAction(true);
    const action = pendingAction;
    const result = await executeJurisMutationTool(action, toolContext);
    setPendingAction(null);
    setExecutingAction(false);
    setMessages((current) => [
      ...current,
      createAssistantMessage(result.ok ? `Listo. ${result.summary}` : `No pude guardar el cambio. ${result.summary}`),
    ]);
  };

  const cancelPendingAction = () => {
    if (!pendingAction || executingAction) return;
    setPendingAction(null);
    setMessages((current) => [
      ...current,
      createAssistantMessage('Acción cancelada. No se modificó ningún dato.'),
    ]);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    sendPrompt(input).catch(() => undefined);
  };

  const canChat = aiEnabled && engineStatus === 'ready' && !pendingAction;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <JurisFace />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  <Sparkles className="w-4 h-4" />
                  Juris IA 2.0
                </div>
                <h2 className="mt-3 text-3xl font-bold text-slate-950">Asistente IA local</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Chat privado conectado a modelos instalados en esta computadora. Solo se activa cuando el usuario lo solicita.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleEnableAI(!aiEnabled)}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  aiEnabled
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-blue-700 text-white hover:bg-blue-800'
                }`}
              >
                <Power className="h-4 w-4" />
                {aiEnabled ? 'IA activada' : 'Activar IA'}
              </button>
              <button
                type="button"
                onClick={() => checkEngine(selectedModel)}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                <RefreshCw className="h-4 w-4" />
                Revisar motor
              </button>
              <button
                type="button"
                onClick={() => openExternal(JURIS_AI_PORTAL_GUIDE_URL)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                Tutorial
              </button>
            </div>
          </div>
        </div>

        {remoteDeployment && deploymentModel && (
          <div className="border-b border-blue-100 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
                  <DownloadCloud className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950 dark:text-white">{remoteDeployment.title}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-blue-200">
                      {remoteDeployment.release_version}
                    </span>
                    {lastAppliedDeploymentId === remoteDeployment.id && deploymentInstalledModelName && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
                        Aplicado
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {remoteDeployment.notes || `${deploymentModel.shortName} es la configuración aprobada para este equipo.`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    La señal remota solo elige un nivel autorizado. La descarga se hace desde el registro oficial de Ollama y no ejecuta comandos enviados desde Internet.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {remoteDeployment.auto_install_allowed && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={automaticModelUpdates}
                      onChange={(event) => changeAutomaticModelUpdates(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                    Actualizar modelos automáticamente
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => activateDeploymentModel().catch(() => undefined)}
                  disabled={isInstallingModel}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {deploymentInstalledModelName ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {deploymentInstalledModelName ? `Usar ${deploymentModel.shortName}` : `Instalar ${deploymentModel.shortName}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {isInstallingModel && (
          <div className="border-b border-blue-100 bg-blue-50 px-6 py-4 dark:border-blue-900/50 dark:bg-blue-950/30">
            <div className="flex items-center justify-between gap-4 text-sm text-blue-900 dark:text-blue-100">
              <span>{modelInstallState?.message ?? 'Conectando con el registro oficial de Ollama...'}</span>
              <button
                type="button"
                onClick={cancelModelInstall}
                className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200"
              >
                Cancelar
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full bg-blue-700 transition-[width] duration-300 ${modelInstallState?.percent === null ? 'animate-pulse' : ''}`}
                style={{ width: `${modelInstallState?.percent ?? 35}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid min-h-[620px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-[620px] flex-col">
            <div className="border-b border-slate-200 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {visibleModels.map((model) => {
                  const selected = isLegacyMacOllama || model.id === selectedModelId;
                  const enoughRam = hardware ? hardware.totalMemoryGb >= model.minimumRamGb : true;
                  const enoughVram = model.recommendedVramGb === 0 || bestGpuVram >= model.recommendedVramGb;

                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => !isLegacyMacOllama && setSelectedModelId(model.id)}
                      className={`rounded-md border p-4 text-left transition-all hover:-translate-y-0.5 ${
                        selected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        {isLegacyMacOllama ? 'Ollama macOS' : model.label}
                      </span>
                      <strong className="mt-1 block text-base text-slate-950">
                        {isLegacyMacOllama ? 'Ollama macOS' : model.shortName}
                      </strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        {model.model}{model.approximateDownload ? ` · ${model.approximateDownload}` : ''}
                      </span>
                      {isLegacyMacOllama && (
                        <span className="mt-2 block text-xs text-slate-500">
                          Compatibilidad para macOS {hardware?.macOSVersion ?? localOllamaState?.macOSVersion ?? '14 o anterior'}.
                        </span>
                      )}
                      <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        enoughRam && enoughVram ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {enoughRam && enoughVram ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {enoughRam && enoughVram ? 'Compatible' : 'Puede ir lento'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Detección local y privacidad</p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
                        Judicial solo revisa ubicaciones estándar de Ollama y consulta el motor local en esta computadora. No examina documentos, expedientes ni archivos personales para detectar modelos.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectOllamaLocation}
                      disabled={selectingOllamaLocation}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
                    >
                      <HardDrive className="h-4 w-4" />
                      {selectingOllamaLocation ? 'Abriendo selector...' : 'Elegir ubicación de Ollama'}
                    </button>
                    {localOllamaState?.configuredPath && (
                      <button
                        type="button"
                        onClick={clearOllamaLocation}
                        disabled={selectingOllamaLocation}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        Usar detección automática
                      </button>
                    )}
                  </div>
                </div>
                {localOllamaState?.configuredPath && (
                  <p className="mt-3 truncate rounded bg-white px-3 py-2 font-mono text-xs text-slate-600" title={localOllamaState.configuredPath}>
                    Ubicación elegida: {localOllamaState.configuredPath}
                  </p>
                )}
              </div>
            </div>

            {isLegacyMacOllama && localOllamaState?.installed && (
              <div className="border-b border-amber-200 bg-amber-50 p-5">
                <div className="rounded-md border border-amber-200 bg-white p-4 text-sm text-amber-950">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
                    <div>
                      <p className="font-semibold">Debido a las limitaciones de esta versión de macOS, algunas funciones estarán limitadas:</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        <li>Juris usara un modelo ligero para cuidar memoria y estabilidad.</li>
                        <li>Los documentos largos, PDFs pesados y analisis extensos pueden tardar mas.</li>
                        <li>No se mostraran niveles Gama Media o Gama Alta en este equipo.</li>
                        <li>Las respuestas con herramientas avanzadas dependen de que el modelo instalado sea compatible.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(!aiEnabled || engineStatus !== 'ready') && (
              <div className="border-b border-slate-200 bg-slate-50 p-5">
                <div className="rounded-md border border-blue-100 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{engineMessage}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {engineStatus === 'offline'
                          ? 'Instala y abre Ollama para que Judicial pueda hablar con modelos locales.'
                          : engineStatus === 'missing-model'
                            ? 'Descarga el modelo recomendado y vuelve a revisar el motor.'
                            : aiEnabled
                              ? 'Estamos verificando la conexión local.'
                              : 'La IA esta apagada. Puedes activarla cuando quieras usar el motor local.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {engineStatus === 'offline' && (
                        <button
                          type="button"
                          onClick={() => openExternal(ollamaDownloadUrl)}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                        >
                          <Download className="h-4 w-4" />
                          {isLegacyMacOllama ? 'Descargar Ollama v0.12.3 para macOS desde GitHub' : 'Descargar Ollama'}
                        </button>
                      )}
                      {engineStatus === 'missing-model' && (
                        <button
                          type="button"
                          onClick={installSelectedModel}
                          disabled={isInstallingModel}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                        >
                          <Download className="h-4 w-4" />
                          {isSelectedModelInstalling
                            ? `Instalando${modelInstallState?.percent === null ? '' : ` ${modelInstallState?.percent}%`}`
                            : `Instalar ${selectedModel.shortName}${selectedModel.approximateDownload ? ` (${selectedModel.approximateDownload})` : ''}`}
                        </button>
                      )}
                      {!aiEnabled && (
                        <button
                          type="button"
                          onClick={() => handleEnableAI(true)}
                          className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                        >
                          <Zap className="h-4 w-4" />
                          Activar en esta app
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <article key={message.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                    {isUser ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">
                        Yo
                      </div>
                    ) : (
                      <JurisFace compact />
                    )}
                    <div className={`max-w-[84%] ${isUser ? 'text-right' : ''}`}>
                      <div
                        className={`whitespace-pre-wrap rounded-md border px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? 'border-blue-200 bg-blue-700 text-white'
                            : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </article>
                );
              })}
              {sending && (
                <div className="flex gap-3">
                  <JurisFace compact />
                  <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    {activityMessage}
                  </div>
                </div>
              )}
              {pendingAction && (
                <div className="ml-12 rounded-md border border-amber-300 bg-amber-50 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                      <LockKeyhole className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-amber-950">{pendingAction.title}</p>
                      <p className="mt-1 text-xs text-amber-800">
                        Juris no guardara nada hasta que confirmes.
                      </p>
                      <dl className="mt-3 space-y-1 rounded-md border border-amber-200 bg-white p-3">
                        {pendingAction.details.map((detail) => (
                          <div key={detail} className="text-sm text-slate-700">{detail}</div>
                        ))}
                      </dl>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelPendingAction}
                          disabled={executingAction}
                          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmPendingAction().catch(() => undefined)}
                          disabled={executingAction}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {executingAction ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          {executingAction ? 'Guardando...' : 'Confirmar y guardar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-end gap-3">
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
                  placeholder={canChat ? 'Pregunta a Juris IA...' : 'Activa la IA local y verifica el modelo para escribir aqui.'}
                  disabled={!canChat || sending}
                  className="min-h-11 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || !canChat || sending}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
                  title="Enviar"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>{selectedModel.shortName}</span>
                <span>{pendingAction ? 'Confirma o cancela la acción pendiente' : `${input.length}/1600`}</span>
              </div>
            </form>
          </div>

          <aside className="border-t border-slate-200 bg-white p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <Server className="h-4 w-4" />
              Estado local
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motor</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {engineStatus === 'ready' ? 'Listo' : engineStatus === 'offline' ? 'No instalado/abierto' : engineStatus === 'missing-model' ? 'Falta modelo' : 'Revisando'}
                </p>
                <p className="mt-1 text-xs text-slate-500">{JURIS_AI_ENDPOINT}</p>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipo detectado</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p className="flex items-center gap-2"><Cpu className="h-4 w-4 text-blue-700" /> {hardware?.cpuModel ?? 'Revisando CPU'}</p>
                  <p className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-blue-700" /> RAM: {formatHardwareValue(hardware?.totalMemoryGb ?? 0)}</p>
                  <p className="flex items-center gap-2"><Zap className="h-4 w-4 text-blue-700" /> VRAM: {formatHardwareValue(bestGpuVram)}</p>
                </div>
              </div>

              <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <ShieldCheck className="h-4 w-4" />
                  Acceso protegido
                </p>
                <p className="mt-2 text-xs leading-relaxed text-blue-900">
                  Juris consulta solamente el despacho seleccionado. Las lecturas son directas y cada cambio requiere tu confirmacion.
                </p>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="h-4 w-4 text-blue-700" />
                  Datos del despacho
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  {canEdit
                    ? 'Puede consultar expedientes, clientes, movimientos y agenda; tambien preparar altas y modificaciones confirmadas.'
                    : 'Puede consultar expedientes, clientes, movimientos y agenda. Tu rol actual no permite modificaciones.'}
                </p>
              </div>

            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultas con datos</p>
              <div className="mt-3 grid gap-2">
                {[
                  { label: 'Resumen del despacho', prompt: 'Dame un resumen real del despacho actual.' },
                  { label: 'Agenda de 7 dias', prompt: 'Consulta mi agenda real de los proximos 7 dias.' },
                  { label: 'Expedientes activos', prompt: 'Busca y resume los expedientes activos del despacho.' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => sendPrompt(item.prompt).catch(() => undefined)}
                    disabled={!canChat || sending}
                    className="inline-flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accesos rapidos</p>
              <div className="mt-3 grid gap-2">
                {[
                  { label: 'Expedientes', target: 'expedientes' as JurisTarget },
                  { label: 'Movimientos', target: 'movimientos' as JurisTarget },
                  { label: 'Calendario', target: 'calendario' as JurisTarget },
                  { label: 'Escriba', target: 'escriba' as JurisTarget },
                  { label: 'Archivo', target: 'archivo' as JurisTarget },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onNavigate(item.target)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
