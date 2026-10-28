/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

type AppUpdateStatus =
  | 'idle'
  | 'development'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'applying'
  | 'error';

interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  macInstallLocationReady: boolean;
  message: string;
}

interface AppUpdateActionResult {
  ok: boolean;
  message?: string;
}

type OllamaStatus =
  | 'checking'
  | 'not-installed'
  | 'starting'
  | 'installed-offline'
  | 'missing-model'
  | 'ready';

interface OllamaState {
  status: OllamaStatus;
  installed: boolean;
  running: boolean;
  ready: boolean;
  version: string | null;
  executablePath: string | null;
  models: string[];
  platform?: string;
  macOSVersion?: string | null;
  macOSMajor?: number | null;
  legacyMacOS?: boolean;
  legacyDownloadUrl?: string | null;
  configuredPath?: string | null;
  checkedAt: string | null;
  message: string;
}

interface DocumentTextExtractionResult {
  ok: boolean;
  status: 'ready' | 'needs_ocr' | 'unsupported' | 'failed';
  extractionMethod?: string | null;
  extractedText?: string;
  pageCount?: number | null;
  sha256?: string;
  errorMessage?: string | null;
}

interface OllamaLocationResult extends AppUpdateActionResult {
  canceled?: boolean;
  path?: string | null;
  state?: OllamaState;
}

interface JurisModelCatalog {
  catalogId: string;
  catalogVersion: string;
  distributionPolicy: string;
  models: Array<{
    id: 'low' | 'medium' | 'high' | 'professional';
    label: string;
    shortName: string;
    model: string;
    officialPage: string | null;
    license: string | null;
    approximateDownload: string | null;
    minimumRamGb: number;
    recommendedRamGb: number;
    minimumDiskGb: number;
    recommendedVramGb: number;
    description: string;
    bestFor: string[];
  }>;
}

interface JurisModelInstallState {
  modelId: string;
  status: 'starting' | 'downloading' | 'completed' | 'canceled' | 'error';
  percent: number | null;
  total?: number | null;
  transferred?: number | null;
  message: string;
}

interface JurisModelInstallResult extends AppUpdateActionResult {
  canceled?: boolean;
  state?: OllamaState;
}

interface CachedJurisReference {
  id: string;
  title: string;
  fileName: string;
  documentKind: string;
  matter: string;
  keywords: string[];
  priority: number;
  isDefault: boolean;
  extractedText: string;
  updatedAt: string;
}

interface EscribaDocumentPayload {
  title: string;
  html: string;
  text: string;
  format?: 'docx' | 'doc' | 'odt' | 'odf' | 'pdf' | 'html' | 'txt';
  pageSize: 'letter' | 'a4' | 'legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

interface EscribaFileResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  title?: string;
  html?: string;
  sourceFormat?: string;
  warnings?: string[];
}

interface DespachoBackupSaveResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  size?: number;
}

interface WindowPresentation {
  fullScreen: boolean;
  maximized: boolean;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  workAreaWidth: number;
  workAreaHeight: number;
  scaleFactor: number;
  displayMode: 'compact' | 'standard' | 'wide' | 'ultrawide';
}

interface Window {
  judicialDesktop?: {
    platform: string;
    versions: {
      electron?: string;
      chrome?: string;
    };
    openExternalUrl?: (url: string) => Promise<boolean>;
    getWindowPresentation?: () => Promise<WindowPresentation>;
    getSecureAuthValue?: (key: string) => Promise<string | null>;
    setSecureAuthValue?: (key: string, value: string) => Promise<AppUpdateActionResult>;
    removeSecureAuthValue?: (key: string) => Promise<AppUpdateActionResult>;
    clearSecureAuthValues?: () => Promise<AppUpdateActionResult>;
    copyToClipboard?: (text: string) => Promise<AppUpdateActionResult>;
    extractDocumentText?: (payload: {
      url: string;
      fileName: string;
      fileType: string;
    }) => Promise<DocumentTextExtractionResult>;
    importEscribaDocument?: () => Promise<EscribaFileResult>;
    importEscribaDocumentFromUrl?: (payload: { url: string; fileName: string }) => Promise<EscribaFileResult>;
    exportEscribaDocument?: (payload: EscribaDocumentPayload) => Promise<EscribaFileResult>;
    printEscribaDocument?: (payload: EscribaDocumentPayload) => Promise<EscribaFileResult>;
    saveDespachoBackup?: (payload: { fileName: string; base64: string; automatic: boolean }) => Promise<DespachoBackupSaveResult>;
    getAppUpdateState?: () => Promise<AppUpdateState>;
    checkForAppUpdate?: () => Promise<AppUpdateState>;
    downloadAppUpdate?: () => Promise<AppUpdateActionResult>;
    installAppUpdate?: () => Promise<AppUpdateActionResult>;
    onAppUpdateStatus?: (callback: (state: AppUpdateState) => void) => () => void;
    getHardwareProfile?: () => Promise<{
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
    }>;
    getOllamaStatus?: () => Promise<OllamaState>;
    checkOllamaStatus?: () => Promise<OllamaState>;
    getJurisModelCatalog?: () => Promise<JurisModelCatalog>;
    replaceJurisReferenceCache?: (payload: {
      despachoId: string;
      references: CachedJurisReference[];
    }) => Promise<AppUpdateActionResult & { count?: number }>;
    getJurisReferenceCache?: (despachoId: string) => Promise<CachedJurisReference[]>;
    removeJurisReferenceCache?: (payload: {
      despachoId: string;
      referenceId: string;
    }) => Promise<AppUpdateActionResult>;
    installJurisModel?: (modelId: string) => Promise<JurisModelInstallResult>;
    cancelJurisModelInstall?: () => Promise<AppUpdateActionResult>;
    selectOllamaLocation?: () => Promise<OllamaLocationResult>;
    clearOllamaLocation?: () => Promise<OllamaLocationResult>;
    onOllamaStatus?: (callback: (state: OllamaState) => void) => () => void;
    onJurisModelInstallStatus?: (callback: (state: JurisModelInstallState) => void) => () => void;
    reportRendererError?: (details: {
      source: string;
      message: string;
      stack?: string;
    }) => void;
    onAuthCallback?: (callback: (url: string) => void) => () => void;
    onWindowPresentation?: (callback: (state: WindowPresentation) => void) => () => void;
  };
}
