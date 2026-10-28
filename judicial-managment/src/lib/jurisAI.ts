export const LEGACY_JURIS_BOT_ENABLED = false;

export const JURIS_AI_VERSION = '3.3.0';
export const JURIS_AI_ENABLED_KEY = 'jm-juris-ai-enabled';
export const JURIS_AI_PROMPTED_KEY = 'jm-juris-ai-v3-prompted';
export const JURIS_AI_MODEL_KEY = 'jm-juris-ai-model';
export const JURIS_AI_CUSTOM_MODEL_KEY = 'jm-juris-ai-custom-model';
export const JURIS_AI_ENDPOINT = '/judicial-web-ai';
export const JURIS_AI_PORTAL_GUIDE_URL = 'https://yzdemnz.github.io/judicial-managment-portal/#ia-local';
export const OLLAMA_LEGACY_MAC_DOWNLOAD_URL = 'https://github.com/ollama/ollama/releases/download/v0.12.3/Ollama-darwin.zip';

export type JurisAIProfileId = 'low' | 'medium' | 'high' | 'professional';

export interface HardwareProfile {
  platform: string;
  osRelease?: string;
  macOSVersion?: string | null;
  macOSMajor?: number | null;
  legacyOllama?: boolean;
  totalMemoryGb: number;
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  gpus: Array<{
    name: string;
    adapterRamGb: number | null;
  }>;
}

export interface JurisAIModelProfile {
  id: JurisAIProfileId;
  label: string;
  model: string;
  shortName: string;
  minimumRamGb: number;
  recommendedRamGb: number;
  minimumDiskGb: number;
  recommendedVramGb: number;
  description: string;
  bestFor: string[];
  approximateDownload?: string;
  license?: string;
  officialPage?: string;
}

export const JURIS_AI_MODELS: JurisAIModelProfile[] = [
  {
    id: 'low',
    label: 'Equipo de Gama Baja',
    model: 'qwen2.5:1.5b',
    shortName: 'Juris Ligero',
    minimumRamGb: 8,
    recommendedRamGb: 12,
    minimumDiskGb: 2,
    recommendedVramGb: 0,
    description: 'Modelo pequeño para equipos sin GPU dedicada o con poca memoria.',
    bestFor: ['orientación dentro de la app', 'checklists', 'clasificación simple', 'respuestas cortas'],
    approximateDownload: '986 MB',
    license: 'Apache-2.0',
    officialPage: 'https://ollama.com/library/qwen2.5:1.5b',
  },
  {
    id: 'medium',
    label: 'Gama Media',
    model: 'qwen2.5:3b-instruct',
    shortName: 'Juris Medio',
    minimumRamGb: 16,
    recommendedRamGb: 24,
    minimumDiskGb: 4,
    recommendedVramGb: 2,
    description: 'Modelo equilibrado para redactar, resumir y ordenar información jurídica del despacho.',
    bestFor: ['resúmenes', 'borradores simples', 'fechas de audiencia', 'explicaciones por materia'],
    approximateDownload: '1.9 GB',
    license: 'Apache-2.0',
    officialPage: 'https://ollama.com/library/qwen2.5:3b-instruct',
  },
  {
    id: 'high',
    label: 'Gama Alta',
    model: 'qwen2.5:7b',
    shortName: 'Juris Avanzado',
    minimumRamGb: 20,
    recommendedRamGb: 24,
    minimumDiskGb: 6,
    recommendedVramGb: 6,
    description: 'Modelo más capaz para equipos con mejor RAM y GPU dedicada.',
    bestFor: ['documentos más largos', 'comparación de textos', 'análisis más completo', 'razonamiento más cuidadoso'],
    approximateDownload: '4.7 GB',
    license: 'Apache-2.0',
    officialPage: 'https://ollama.com/library/qwen2.5:7b',
  },
  {
    id: 'professional',
    label: 'Gama Profesional',
    model: 'qwen2.5:14b',
    shortName: 'Juris Profesional',
    minimumRamGb: 24,
    recommendedRamGb: 32,
    minimumDiskGb: 11,
    recommendedVramGb: 10,
    description: 'Modelo local de mayor capacidad para equipos con memoria amplia.',
    bestFor: ['escritos complejos', 'síntesis extensas', 'revisión de argumentos', 'asistencia jurídica avanzada'],
    approximateDownload: '9.0 GB',
    license: 'Apache-2.0',
    officialPage: 'https://ollama.com/library/qwen2.5:14b',
  },
];

export const JURIS_AI_DEFAULT_MODEL = JURIS_AI_MODELS[1];

export const normalizeJurisAIProfileId = (value: string | null): JurisAIProfileId | null => {
  if (value === 'gamer') return 'high';
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'professional') return value;
  return null;
};

export const normalizeOllamaModelName = (value: string | null | undefined) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/:latest$/, '')
);

const normalizeOllamaModelFamily = (value: string | null | undefined) => (
  normalizeOllamaModelName(value)
    .replace(/-instruct(?:[-_:].*)?$/, '')
    .replace(/(?:[-_:](?:q\d+|f\d+|fp\d+|q4_k_m|q5_k_m|q8_0).*)$/, '')
);

export const isOllamaModelMatch = (installedModel: string, expectedModel: string) => {
  const installed = normalizeOllamaModelName(installedModel);
  const expected = normalizeOllamaModelName(expectedModel);
  if (!installed || !expected) return false;
  if (installed === expected || installed.startsWith(`${expected}:`)) return true;

  const installedFamily = normalizeOllamaModelFamily(installed);
  const expectedFamily = normalizeOllamaModelFamily(expected);
  return Boolean(installedFamily && expectedFamily && installedFamily === expectedFamily);
};

export const findInstalledJurisAIProfile = (installedModels: string[]) => {
  return JURIS_AI_MODELS.find((profile) => (
    installedModels.some((modelName) => isOllamaModelMatch(modelName, profile.model))
  )) ?? null;
};

export const pickInstalledOllamaModelName = (installedModels: string[]) => {
  const cleanModels = installedModels.map((model) => model.trim()).filter(Boolean);
  const knownModel = cleanModels.find((modelName) => (
    JURIS_AI_MODELS.some((profile) => isOllamaModelMatch(modelName, profile.model))
  ));
  if (knownModel) return knownModel;
  return cleanModels[0] ?? null;
};

export const getBestGpuVram = (hardware: HardwareProfile | null) => {
  if (!hardware?.gpus.length) return 0;
  return hardware.gpus.reduce((best, gpu) => Math.max(best, gpu.adapterRamGb ?? 0), 0);
};

export const getRecommendedJurisAIModel = (hardware: HardwareProfile | null) => {
  if (!hardware) return JURIS_AI_DEFAULT_MODEL;

  const ram = hardware.totalMemoryGb;
  const vram = getBestGpuVram(hardware);

  if (ram >= 32 && vram >= 10) return JURIS_AI_MODELS[3];
  if (ram >= 20 && vram >= 6) return JURIS_AI_MODELS[2];
  if (ram >= 16) return JURIS_AI_MODELS[1];
  return JURIS_AI_MODELS[0];
};

export const isJurisAIEnabled = () => window.localStorage.getItem(JURIS_AI_ENABLED_KEY) === 'true';

export const setJurisAIEnabled = (enabled: boolean) => {
  window.localStorage.setItem(JURIS_AI_ENABLED_KEY, enabled ? 'true' : 'false');
};
