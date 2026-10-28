const { app, BrowserWindow, Menu, ipcMain, shell, nativeImage, dialog, session, clipboard, safeStorage, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
if (process.platform === 'darwin') {
  app.disableHardwareAcceleration();
}

let mainWindow = null;
let updaterConfigured = false;
let ollamaMonitorConfigured = false;
let ollamaLaunchAttemptedAt = 0;
let rendererRecoveryAttempts = 0;
let customOllamaPath = null;
let ollamaSettingsLoaded = false;
let activeOllamaModelInstall = null;
const authProtocol = 'judicial-managment';
const allowedExternalProtocols = new Set(['https:', 'http:']);
const iconFileName = process.platform === 'darwin'
  ? 'icon.icns'
  : process.platform === 'win32'
    ? 'icon.ico'
    : 'icon.png';
const iconPath = path.join(__dirname, '../assets/icons', iconFileName);
const appIcon = nativeImage.createFromPath(iconPath);
const ollamaEndpoint = 'http://127.0.0.1:11434';
const jurisModelCatalogPath = path.join(__dirname, '../assets/juris-model-catalog.json');
const JURIS_REFERENCE_CACHE_VERSION = 1;
const SECURE_AUTH_STORE_VERSION = 1;
const OLLAMA_CHECK_INTERVAL_MS = 10 * 1000;
const OLLAMA_LAUNCH_RETRY_MS = 60 * 1000;
const OLLAMA_LEGACY_MAC_DOWNLOAD_URL = 'https://github.com/ollama/ollama/releases/download/v0.12.3/Ollama-darwin.zip';
const updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseName: null,
  releaseNotes: null,
  releaseDate: null,
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  macInstallLocationReady: true,
  message: 'El sistema de actualizaciones esta listo.',
};
const ollamaState = {
  status: 'checking',
  installed: false,
  running: false,
  ready: false,
  version: null,
  executablePath: null,
  models: [],
  platform: process.platform,
  macOSVersion: null,
  macOSMajor: null,
  legacyMacOS: false,
  legacyDownloadUrl: null,
  checkedAt: null,
  message: 'Buscando Ollama en esta computadora...',
};

const normalizeCatalogModel = (entry) => {
  const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
  const model = typeof entry?.ollamaModel === 'string' ? entry.ollamaModel.trim() : '';
  if (!/^(low|medium|high|professional)$/.test(id)) return null;
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9][a-z0-9._-]*)?$/i.test(model)) return null;

  return {
    id,
    label: String(entry.label ?? id),
    shortName: String(entry.shortName ?? model),
    model,
    officialPage: typeof entry.officialPage === 'string' ? entry.officialPage : null,
    license: typeof entry.license === 'string' ? entry.license : null,
    approximateDownload: typeof entry.approximateDownload === 'string' ? entry.approximateDownload : null,
    minimumRamGb: Number(entry.minimumRamGb) || 0,
    recommendedRamGb: Number(entry.recommendedRamGb) || 0,
    minimumDiskGb: Number(entry.minimumDiskGb) || 0,
    recommendedVramGb: Number(entry.recommendedVramGb) || 0,
    description: String(entry.description ?? ''),
    bestFor: Array.isArray(entry.bestFor) ? entry.bestFor.map((item) => String(item)).filter(Boolean) : [],
  };
};

const loadJurisModelCatalog = () => {
  try {
    const raw = fs.readFileSync(jurisModelCatalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const models = Array.isArray(parsed?.models)
      ? parsed.models.map(normalizeCatalogModel).filter(Boolean)
      : [];

    return {
      catalogId: typeof parsed?.catalogId === 'string' ? parsed.catalogId : 'judicial-managment-juris-models',
      catalogVersion: typeof parsed?.catalogVersion === 'string' ? parsed.catalogVersion : 'local',
      distributionPolicy: typeof parsed?.distributionPolicy === 'string'
        ? parsed.distributionPolicy
        : 'official-ollama-registry-only',
      models,
    };
  } catch (error) {
    log.warn('Could not load Juris model catalog', error);
    return {
      catalogId: 'judicial-managment-juris-models',
      catalogVersion: 'unavailable',
      distributionPolicy: 'official-ollama-registry-only',
      models: [],
    };
  }
};

const getJurisReferenceCachePath = () => path.join(app.getPath('userData'), 'juris-reference-cache.bin');
const getSecureAuthStorePath = () => path.join(app.getPath('userData'), 'secure-auth-store.bin');

const isAllowedSecureAuthKey = (value) => (
  typeof value === 'string'
  && /^sb-[a-z0-9]+-auth-token(?:-(?:code-verifier|user))?$/.test(value)
);

const readSecureAuthStore = () => {
  if (!safeStorage.isEncryptionAvailable()) return {};
  const storePath = getSecureAuthStorePath();
  if (!fs.existsSync(storePath)) return {};

  try {
    const decrypted = safeStorage.decryptString(fs.readFileSync(storePath));
    const parsed = JSON.parse(decrypted);
    return parsed?.version === SECURE_AUTH_STORE_VERSION && parsed?.values && typeof parsed.values === 'object'
      ? parsed.values
      : {};
  } catch (error) {
    log.warn('Could not read encrypted authentication store', error);
    return {};
  }
};

const writeSecureAuthStore = (values) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: 'El cifrado local del sistema operativo no esta disponible.' };
  }

  try {
    const encrypted = safeStorage.encryptString(JSON.stringify({
      version: SECURE_AUTH_STORE_VERSION,
      updatedAt: new Date().toISOString(),
      values,
    }));
    fs.mkdirSync(path.dirname(getSecureAuthStorePath()), { recursive: true });
    fs.writeFileSync(getSecureAuthStorePath(), encrypted);
    return { ok: true };
  } catch (error) {
    log.warn('Could not write encrypted authentication store', error);
    return { ok: false, message: 'No se pudo proteger la sesion en este equipo.' };
  }
};

const getWindowPresentation = () => {
  const windowAvailable = Boolean(mainWindow && !mainWindow.isDestroyed());
  const bounds = windowAvailable ? mainWindow.getBounds() : { x: 0, y: 0, width: 1360, height: 860 };
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workAreaSize;
  const aspectRatio = bounds.width / Math.max(bounds.height, 1);
  const displayMode = bounds.width < 1100 || bounds.height < 700
    ? 'compact'
    : bounds.width >= 1800 && aspectRatio >= 1.85
      ? 'ultrawide'
      : bounds.width >= 1560
        ? 'wide'
        : 'standard';

  return {
    fullScreen: windowAvailable && mainWindow.isFullScreen(),
    maximized: windowAvailable && mainWindow.isMaximized(),
    width: bounds.width,
    height: bounds.height,
    displayWidth: display.size.width,
    displayHeight: display.size.height,
    workAreaWidth: workArea.width,
    workAreaHeight: workArea.height,
    scaleFactor: display.scaleFactor,
    displayMode,
  };
};

const normalizeCachedJurisReference = (entry) => {
  const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
  const despachoId = typeof entry?.despachoId === 'string' ? entry.despachoId.trim() : '';
  const extractedText = typeof entry?.extractedText === 'string'
    ? entry.extractedText.replaceAll('\0', '').trim().slice(0, 160000)
    : '';
  if (!id || !despachoId || !extractedText) return null;

  return {
    id,
    despachoId,
    title: String(entry.title ?? 'Referencia privada').trim().slice(0, 180),
    fileName: String(entry.fileName ?? '').trim().slice(0, 260),
    documentKind: String(entry.documentKind ?? '').trim().slice(0, 80),
    matter: String(entry.matter ?? '').trim().slice(0, 80),
    keywords: Array.isArray(entry.keywords)
      ? entry.keywords.map((keyword) => String(keyword).trim().slice(0, 80)).filter(Boolean).slice(0, 30)
      : [],
    priority: Math.max(0, Math.min(1000, Number(entry.priority) || 100)),
    isDefault: entry.isDefault === true,
    extractedText,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
  };
};

const readJurisReferenceCache = () => {
  if (!safeStorage.isEncryptionAvailable()) return { version: JURIS_REFERENCE_CACHE_VERSION, references: [] };
  const cachePath = getJurisReferenceCachePath();
  if (!fs.existsSync(cachePath)) return { version: JURIS_REFERENCE_CACHE_VERSION, references: [] };

  try {
    const decrypted = safeStorage.decryptString(fs.readFileSync(cachePath));
    const parsed = JSON.parse(decrypted);
    const references = Array.isArray(parsed?.references)
      ? parsed.references.map(normalizeCachedJurisReference).filter(Boolean).slice(0, 300)
      : [];
    return { version: JURIS_REFERENCE_CACHE_VERSION, references };
  } catch (error) {
    log.warn('Could not read encrypted Juris reference cache', error);
    return { version: JURIS_REFERENCE_CACHE_VERSION, references: [] };
  }
};

const writeJurisReferenceCache = (references) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: 'El cifrado local del sistema operativo no esta disponible.' };
  }

  try {
    const normalized = references.map(normalizeCachedJurisReference).filter(Boolean).slice(0, 300);
    const serialized = JSON.stringify({
      version: JURIS_REFERENCE_CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      references: normalized,
    });
    const encrypted = safeStorage.encryptString(serialized);
    fs.mkdirSync(path.dirname(getJurisReferenceCachePath()), { recursive: true });
    fs.writeFileSync(getJurisReferenceCachePath(), encrypted);
    return { ok: true, count: normalized.length };
  } catch (error) {
    log.warn('Could not write encrypted Juris reference cache', error);
    return { ok: false, message: 'No se pudo actualizar la biblioteca privada local.' };
  }
};

const replaceCachedJurisReferences = (payload) => {
  const despachoId = typeof payload?.despachoId === 'string' ? payload.despachoId.trim() : '';
  if (!despachoId || !Array.isArray(payload?.references)) {
    return { ok: false, message: 'La biblioteca privada recibida no es valida.' };
  }

  const current = readJurisReferenceCache().references.filter((reference) => reference.despachoId !== despachoId);
  const replacements = payload.references
    .map((reference) => normalizeCachedJurisReference({ ...reference, despachoId }))
    .filter(Boolean)
    .slice(0, 60);
  return writeJurisReferenceCache([...current, ...replacements]);
};

const sendOllamaModelInstallState = (nextState) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ollama-model-install-status', nextState);
  }
};

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.disableWebInstaller = true;
autoUpdater.allowPrerelease = false;

const normalizeReleaseNotes = (releaseNotes) => {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') {
    return releaseNotes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((entry) => entry?.note)
      .filter(Boolean)
      .join('\n');
  }

  return null;
};

const isMacApplicationLocationReady = () => {
  if (process.platform !== 'darwin' || !app.isPackaged) return true;

  try {
    return app.isInApplicationsFolder();
  } catch {
    return app.getAppPath().includes('/Applications/');
  }
};

const moveMacAppToApplicationsFolder = () => {
  if (process.platform !== 'darwin' || isMacApplicationLocationReady()) {
    return { ok: true, moved: false };
  }

  try {
    const moved = app.moveToApplicationsFolder();
    return {
      ok: moved,
      moved,
      message: moved
        ? 'Judicial se movió a Aplicaciones y se reiniciará. Abre la app desde Aplicaciones y vuelve a aplicar el parche.'
        : 'Para aplicar actualizaciones automáticas en macOS, mueve Judicial Managment a la carpeta Aplicaciones.',
    };
  } catch (error) {
    log.warn('Could not move macOS application to Applications folder', error);
    return {
      ok: false,
      moved: false,
      message: 'No se pudo mover Judicial a Aplicaciones. Arrastra la app a esa carpeta y vuelve a intentar la actualización.',
    };
  }
};

const sendUpdateState = (nextState = {}) => {
  Object.assign(updateState, nextState, {
    currentVersion: app.getVersion(),
    macInstallLocationReady: isMacApplicationLocationReady(),
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update-status', { ...updateState });
  }
};

const sendOllamaState = (nextState = {}) => {
  Object.assign(ollamaState, getOllamaPlatformInfo(), {
    configuredPath: loadCustomOllamaPath(),
  }, nextState, { checkedAt: new Date().toISOString() });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ollama-status', { ...ollamaState });
  }
};

const getMacOSVersion = () => {
  if (process.platform !== 'darwin') return null;

  try {
    const version = childProcess.execFileSync('/usr/bin/sw_vers', ['-productVersion'], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    return version || null;
  } catch {
    const darwinMajor = Number(os.release().split('.')[0]);
    return Number.isFinite(darwinMajor) && darwinMajor >= 20 ? `${darwinMajor - 9}.x` : null;
  }
};

const getOllamaPlatformInfo = () => {
  const macOSVersion = getMacOSVersion();
  const macOSMajor = macOSVersion ? Number(macOSVersion.split('.')[0]) : null;
  const legacyMacOS = process.platform === 'darwin'
    && Number.isFinite(macOSMajor)
    && macOSMajor <= 14;

  return {
    platform: process.platform,
    macOSVersion,
    macOSMajor: Number.isFinite(macOSMajor) ? macOSMajor : null,
    legacyMacOS,
    legacyDownloadUrl: legacyMacOS ? OLLAMA_LEGACY_MAC_DOWNLOAD_URL : null,
  };
};

const getOllamaSettingsPath = () => path.join(app.getPath('userData'), 'ollama-location.json');

const resolveOllamaLocation = (location) => {
  const normalizedLocation = typeof location === 'string' ? location.trim() : '';
  if (!normalizedLocation) return null;

  const candidates = [normalizedLocation];
  if (fs.existsSync(normalizedLocation) && fs.statSync(normalizedLocation).isDirectory()) {
    candidates.push(
      path.join(normalizedLocation, 'Ollama.app'),
      path.join(normalizedLocation, 'ollama'),
      path.join(normalizedLocation, 'ollama.exe'),
      path.join(normalizedLocation, 'ollama app.exe'),
      path.join(normalizedLocation, 'Contents', 'MacOS', 'Ollama'),
      path.join(normalizedLocation, 'Contents', 'MacOS', 'ollama'),
      path.join(normalizedLocation, 'Contents', 'Resources', 'ollama'),
    );
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const loadCustomOllamaPath = () => {
  if (ollamaSettingsLoaded) return customOllamaPath;
  ollamaSettingsLoaded = true;

  try {
    const raw = fs.readFileSync(getOllamaSettingsPath(), 'utf8');
    const stored = JSON.parse(raw);
    customOllamaPath = resolveOllamaLocation(stored?.customOllamaPath);
  } catch {
    customOllamaPath = null;
  }

  return customOllamaPath;
};

const saveCustomOllamaPath = (nextPath) => {
  customOllamaPath = nextPath;
  ollamaSettingsLoaded = true;

  try {
    fs.writeFileSync(getOllamaSettingsPath(), JSON.stringify({ customOllamaPath: nextPath }, null, 2), 'utf8');
  } catch (error) {
    log.warn('Could not save custom Ollama location', error);
  }
};

const getOllamaInstallPaths = () => {
  const candidates = [];
  const configuredPath = loadCustomOllamaPath();
  if (configuredPath) candidates.push(configuredPath);
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(
        path.join(localAppData, 'Programs', 'Ollama', 'ollama app.exe'),
        path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Ollama.app',
      '/Applications/Ollama.app/Contents/MacOS/Ollama',
      '/Applications/Ollama.app/Contents/MacOS/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
      path.join(os.homedir(), 'Applications', 'Ollama.app'),
      path.join(os.homedir(), 'Applications', 'Ollama.app', 'Contents', 'MacOS', 'Ollama'),
      path.join(os.homedir(), 'Applications', 'Ollama.app', 'Contents', 'MacOS', 'ollama'),
      path.join(os.homedir(), 'Applications', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
      path.join(os.homedir(), 'Downloads', 'Ollama.app'),
      path.join(os.homedir(), 'Downloads', 'Ollama.app', 'Contents', 'MacOS', 'Ollama'),
      path.join(os.homedir(), 'Downloads', 'Ollama.app', 'Contents', 'MacOS', 'ollama'),
      path.join(os.homedir(), 'Downloads', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
      path.join(os.homedir(), 'Downloads', 'ollama'),
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/opt/local/bin/ollama',
    );
  } else {
    candidates.push('/usr/local/bin/ollama', '/usr/bin/ollama');
  }

  return candidates;
};

const findMacOllamaAppBundle = () => {
  if (process.platform !== 'darwin') return null;

  const roots = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    path.join(os.homedir(), 'Downloads'),
  ];

  for (const root of roots) {
    const directBundle = path.join(root, 'Ollama.app');
    if (fs.existsSync(directBundle)) return directBundle;

    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const name = entry.name.toLowerCase();
        if (!name.includes('ollama')) continue;

        const candidate = path.join(root, entry.name);
        if (entry.isDirectory() && candidate.toLowerCase().endsWith('.app')) return candidate;

        const nestedBundle = path.join(candidate, 'Ollama.app');
        if (fs.existsSync(nestedBundle)) return nestedBundle;
      }
    } catch {
      // A missing user folder must not stop the rest of the automatic search.
    }
  }

  try {
    const result = childProcess.execFileSync('mdfind', [
      "kMDItemCFBundleIdentifier == 'com.ollama.Ollama'",
    ], { encoding: 'utf8', timeout: 3000 });
    return result.split(/\r?\n/).map((item) => item.trim()).find((item) => item.endsWith('.app')) ?? null;
  } catch {
    return null;
  }
};

const findOllamaExecutable = () => {
  const knownPath = getOllamaInstallPaths().find((candidate) => fs.existsSync(candidate));
  if (knownPath) return knownPath;

  const discoveredMacBundle = findMacOllamaAppBundle();
  if (discoveredMacBundle) return discoveredMacBundle;

  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const output = childProcess.execFileSync(command, ['ollama'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2500,
    });
    return output.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
};

const fetchOllamaJson = async (route, timeoutMs = 6000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ollamaEndpoint}${route}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ollama respondio con ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const runOllamaModelInstall = async (modelId) => {
  const catalog = loadJurisModelCatalog();
  const model = catalog.models.find((entry) => entry.id === modelId);
  if (!model) {
    return { ok: false, message: 'El modelo solicitado no pertenece al catálogo autorizado.' };
  }

  if (activeOllamaModelInstall) {
    return { ok: false, message: 'Ya hay una instalación de modelo en proceso.' };
  }

  const state = await checkOllamaStatus();
  if (!state.running) {
    return { ok: false, message: 'Abre Ollama y vuelve a intentar la instalación.' };
  }

  const controller = new AbortController();
  activeOllamaModelInstall = { modelId, controller };
  sendOllamaModelInstallState({
    modelId,
    status: 'starting',
    percent: 0,
    message: `Preparando ${model.shortName} desde el registro oficial de Ollama...`,
  });

  try {
    const response = await fetch(`${ollamaEndpoint}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ model: model.model, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Ollama respondió con ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    const handleProgressLine = (line) => {
      if (!line.trim()) return;
      let update;
      try {
        update = JSON.parse(line);
      } catch {
        return;
      }

      if (typeof update.error === 'string' && update.error.trim()) {
        throw new Error(update.error.trim());
      }

      const total = Number(update.total);
      const transferred = Number(update.completed);
      const percent = total > 0 && Number.isFinite(transferred)
        ? Math.min(100, Math.round((transferred / total) * 100))
        : null;
      const status = typeof update.status === 'string' ? update.status : 'Descargando modelo...';
      if (status === 'success') completed = true;

      sendOllamaModelInstallState({
        modelId,
        status: completed ? 'completed' : 'downloading',
        percent,
        total: Number.isFinite(total) ? total : null,
        transferred: Number.isFinite(transferred) ? transferred : null,
        message: status,
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      lines.forEach(handleProgressLine);
      if (done) break;
    }
    handleProgressLine(buffer);

    if (!completed) throw new Error('Ollama terminó la descarga sin confirmar el modelo.');

    const nextState = await checkOllamaStatus({ startIfInstalled: false });
    sendOllamaModelInstallState({
      modelId,
      status: 'completed',
      percent: 100,
      message: `${model.shortName} está listo para usarse.`,
    });
    return { ok: true, state: nextState, message: `${model.shortName} quedó instalado.` };
  } catch (error) {
    const canceled = controller.signal.aborted;
    const message = canceled
      ? 'La descarga se detuvo. Ollama puede reanudarla cuando quieras.'
      : (error instanceof Error ? error.message : 'No se pudo instalar el modelo.');
    sendOllamaModelInstallState({
      modelId,
      status: canceled ? 'canceled' : 'error',
      percent: null,
      message,
    });
    return { ok: false, canceled, message };
  } finally {
    activeOllamaModelInstall = null;
  }
};

const cancelOllamaModelInstall = () => {
  if (!activeOllamaModelInstall) {
    return { ok: false, message: 'No hay una descarga activa.' };
  }

  activeOllamaModelInstall.controller.abort();
  return { ok: true, message: 'Se solicitó detener la descarga.' };
};

const launchInstalledOllama = (executablePath) => {
  if (!executablePath) return false;
  const now = Date.now();
  if (now - ollamaLaunchAttemptedAt < OLLAMA_LAUNCH_RETRY_MS) return false;
  ollamaLaunchAttemptedAt = now;

  try {
    const normalizedExecutablePath = executablePath.replace(/\\/g, '/');
    const macBundleIndex = normalizedExecutablePath.toLowerCase().indexOf('.app/');
    if (process.platform === 'darwin' && (normalizedExecutablePath.toLowerCase().endsWith('/ollama.app') || macBundleIndex >= 0)) {
      const appBundlePath = macBundleIndex >= 0
        ? executablePath.slice(0, macBundleIndex + '.app'.length)
        : executablePath;
      const child = childProcess.spawn('open', [appBundlePath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      log.info('Ollama app bundle startup requested', appBundlePath);
      return true;
    }

    const isDesktopApp = (
      process.platform === 'win32' && executablePath.toLowerCase().endsWith('ollama app.exe')
    ) || (
      process.platform === 'darwin' && /\/Contents\/MacOS\/Ollama$/i.test(normalizedExecutablePath)
    );
    const child = childProcess.spawn(executablePath, isDesktopApp ? [] : ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    log.info('Ollama startup requested', executablePath);
    return true;
  } catch (error) {
    log.warn('Could not start Ollama automatically', error);
    return false;
  }
};

const checkOllamaStatus = async ({ startIfInstalled = true } = {}) => {
  const executablePath = findOllamaExecutable();

  try {
    const tagsData = await fetchOllamaJson('/api/tags', 8000);
    let versionData = null;
    try {
      versionData = await fetchOllamaJson('/api/version', 3000);
    } catch (versionError) {
      log.info('Ollama version endpoint is unavailable; continuing with the model catalog.', versionError);
    }
    const models = Array.isArray(tagsData?.models)
      ? tagsData.models
        .map((model) => String(model?.name ?? model?.model ?? '').trim())
        .filter(Boolean)
      : [];
    const ready = models.length > 0;

    sendOllamaState({
      status: ready ? 'ready' : 'missing-model',
      installed: true,
      running: true,
      ready,
      version: typeof versionData?.version === 'string' ? versionData.version : null,
      executablePath,
      models,
      message: ready
        ? `Ollama esta listo con ${models.length} modelo${models.length === 1 ? '' : 's'} local${models.length === 1 ? '' : 'es'}.`
        : 'Ollama esta instalado y activo. Falta descargar al menos un modelo para usar Juris IA.',
    });
  } catch {
    if (!executablePath) {
      sendOllamaState({
        status: 'not-installed',
        installed: false,
        running: false,
        ready: false,
        version: null,
        executablePath: null,
        models: [],
        message: 'Ollama no esta instalado en esta computadora.',
      });
      return { ...ollamaState };
    }

    const starting = startIfInstalled && launchInstalledOllama(executablePath);
    sendOllamaState({
      status: starting ? 'starting' : 'installed-offline',
      installed: true,
      running: false,
      ready: false,
      version: null,
      executablePath,
      models: [],
      message: starting
        ? 'Ollama fue detectado. Judicial lo esta iniciando...'
        : 'Ollama esta instalado, pero su motor local todavia no responde.',
    });
  }

  return { ...ollamaState };
};

const setupOllamaMonitor = () => {
  if (ollamaMonitorConfigured) return;
  ollamaMonitorConfigured = true;

  setTimeout(() => {
    checkOllamaStatus().catch((error) => log.warn('Initial Ollama check failed', error));
  }, 1800);

  setInterval(() => {
    checkOllamaStatus().catch((error) => log.warn('Scheduled Ollama check failed', error));
  }, OLLAMA_CHECK_INTERVAL_MS);
};

const checkForAppUpdates = async ({ manual = false } = {}) => {
  if (!app.isPackaged || isDevelopment) {
    sendUpdateState({
      status: 'development',
      message: manual
        ? 'La comprobacion real funciona en la aplicacion instalada.'
        : 'Actualizaciones desactivadas durante el desarrollo.',
    });
    return { ...updateState };
  }

  if (['checking', 'downloading'].includes(updateState.status)) {
    return { ...updateState };
  }

  sendUpdateState({
    status: 'checking',
    percent: 0,
    message: manual ? 'Buscando parches disponibles...' : 'Revisando actualizaciones...',
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    sendUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : 'No se pudo revisar la actualizacion.',
    });
  }

  return { ...updateState };
};

const setupAutoUpdater = () => {
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState({
      status: 'checking',
      message: 'Buscando parches disponibles...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateState({
      status: 'available',
      availableVersion: info.version,
      releaseName: info.releaseName ?? `Parche ${info.version}`,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ?? null,
      percent: 0,
      message: `El parche ${info.version} esta disponible.`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateState({
      status: 'not-available',
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      percent: 0,
      message: 'Judicial Managment esta actualizado.',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, progress.percent ?? 0)),
      bytesPerSecond: progress.bytesPerSecond ?? 0,
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
      message: `Descargando parche ${updateState.availableVersion ?? ''}...`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateState({
      status: 'downloaded',
      availableVersion: info.version,
      releaseName: info.releaseName ?? updateState.releaseName,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? updateState.releaseNotes,
      releaseDate: info.releaseDate ?? updateState.releaseDate,
      percent: 100,
      message: `El parche ${info.version} esta listo para instalar.`,
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Automatic update error', error);
    sendUpdateState({
      status: 'error',
      message: error?.message ?? 'Ocurrio un error al actualizar.',
    });
  });

  setTimeout(() => {
    checkForAppUpdates().catch((error) => log.error('Initial update check failed', error));
  }, 7000);

  setInterval(() => {
    checkForAppUpdates().catch((error) => log.error('Scheduled update check failed', error));
  }, 4 * 60 * 60 * 1000);
};

if (process.platform === 'win32') {
  app.setAppUserModelId('com.leojudicial.judicialmanagment');
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(authProtocol, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(authProtocol);
}

const sendAuthCallback = (url) => {
  if (!url || !url.startsWith(`${authProtocol}://`)) return;

  if (mainWindow) {
    mainWindow.webContents.send('auth-callback-url', url);
  }
};

const openExternalUrl = async (url) => {
  if (typeof url !== 'string') return false;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  if (!allowedExternalProtocols.has(parsedUrl.protocol)) return false;

  await shell.openExternal(parsedUrl.toString());
  return true;
};

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

const createWindow = () => {
  const isMac = process.platform === 'darwin';
  const primaryWorkArea = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.min(1440, Math.max(820, Math.round(primaryWorkArea.width * 0.92)));
  const initialHeight = Math.min(900, Math.max(600, Math.round(primaryWorkArea.height * 0.9)));
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: Math.min(820, primaryWorkArea.width),
    minHeight: Math.min(600, primaryWorkArea.height),
    title: 'Judicial Managment',
    backgroundColor: '#f8fafc',
    show: false,
    icon: appIcon.isEmpty() ? iconPath : appIcon,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const sendWindowPresentation = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window-presentation', getWindowPresentation());
  };

  let presentationTimer = null;
  const scheduleWindowPresentation = () => {
    if (presentationTimer) clearTimeout(presentationTimer);
    presentationTimer = setTimeout(sendWindowPresentation, 80);
  };

  mainWindow.on('enter-full-screen', sendWindowPresentation);
  mainWindow.on('leave-full-screen', sendWindowPresentation);
  mainWindow.on('maximize', sendWindowPresentation);
  mainWindow.on('unmaximize', sendWindowPresentation);
  mainWindow.on('resize', scheduleWindowPresentation);
  mainWindow.on('move', scheduleWindowPresentation);

  mainWindow.webContents.on('did-finish-load', () => {
    rendererRecoveryAttempts = 0;
    sendUpdateState();
    sendOllamaState();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    log.error('Renderer failed to load', { errorCode, errorDescription, validatedURL });

    if (rendererRecoveryAttempts < 1 && !mainWindow.isDestroyed()) {
      rendererRecoveryAttempts += 1;
      setTimeout(() => mainWindow?.reload(), 1200);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process exited', details);

    if (rendererRecoveryAttempts < 1 && mainWindow && !mainWindow.isDestroyed()) {
      rendererRecoveryAttempts += 1;
      setTimeout(() => mainWindow?.reload(), 1200);
    }
  });

  mainWindow.webContents.on('console-message', (_event, details) => {
    const level = details?.level;
    const shouldLog = (
      (typeof level === 'number' && level >= 2)
      || level === 'warning'
      || level === 'error'
    );
    if (!shouldLog) return;

    log.warn('Renderer console', {
      level,
      message: details?.message,
      line: details?.lineNumber,
      sourceId: details?.sourceId,
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url).catch((error) => log.warn('Could not open external URL', error));
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (url === currentUrl) return;

    event.preventDefault();
    if (url.startsWith(`${authProtocol}://`)) {
      sendAuthCallback(url);
      return;
    }
    openExternalUrl(url).catch((error) => log.warn('Could not open navigated URL', error));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

app.on('second-instance', (_event, argv) => {
  const callbackUrl = argv.find((arg) => arg.startsWith(`${authProtocol}://`));

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  sendAuthCallback(callbackUrl);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  sendAuthCallback(url);
});

ipcMain.handle('open-external-url', async (_event, url) => {
  return openExternalUrl(url);
});

ipcMain.handle('get-window-presentation', () => getWindowPresentation());

ipcMain.handle('get-secure-auth-value', (_event, key) => {
  if (!isAllowedSecureAuthKey(key)) return null;
  const value = readSecureAuthStore()[key];
  return typeof value === 'string' ? value : null;
});

ipcMain.handle('set-secure-auth-value', (_event, payload) => {
  const key = payload?.key;
  const value = payload?.value;
  if (!isAllowedSecureAuthKey(key) || typeof value !== 'string' || value.length > 1_000_000) {
    return { ok: false, message: 'La sesion recibida no es valida.' };
  }

  return writeSecureAuthStore({ ...readSecureAuthStore(), [key]: value });
});

ipcMain.handle('remove-secure-auth-value', (_event, key) => {
  if (!isAllowedSecureAuthKey(key)) return { ok: false };
  if (!safeStorage.isEncryptionAvailable()) {
    try {
      if (fs.existsSync(getSecureAuthStorePath())) fs.rmSync(getSecureAuthStorePath(), { force: true });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  const values = readSecureAuthStore();
  delete values[key];
  return writeSecureAuthStore(values);
});

ipcMain.handle('clear-secure-auth-values', () => {
  const storePath = getSecureAuthStorePath();
  try {
    if (fs.existsSync(storePath)) fs.rmSync(storePath, { force: true });
    return { ok: true };
  } catch (error) {
    log.warn('Could not clear encrypted authentication store', error);
    return { ok: false, message: 'No se pudo olvidar la sesion de este equipo.' };
  }
});

ipcMain.handle('extract-document-text', async (_event, payload) => {
  if (
    !payload
    || typeof payload.url !== 'string'
    || typeof payload.fileName !== 'string'
    || typeof payload.fileType !== 'string'
  ) {
    return { ok: false, status: 'failed', errorMessage: 'Solicitud de extraccion invalida.' };
  }

  try {
    const { extractDocumentText } = await import('./document-text.mjs');
    return await extractDocumentText(payload);
  } catch (error) {
    log.error('Document extraction error', error);
    return {
      ok: false,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'No se pudo leer el documento.',
    };
  }
});

const validateEscribaPayload = (payload) => {
  return payload
    && typeof payload.title === 'string'
    && typeof payload.html === 'string'
    && payload.html.length <= 12_000_000
    && ['letter', 'a4', 'legal'].includes(payload.pageSize)
    && ['portrait', 'landscape'].includes(payload.orientation);
};

ipcMain.handle('escriba-import-document', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir documento en Escriba',
    properties: ['openFile'],
    filters: [
      {
        name: 'Documentos compatibles',
        extensions: ['docx', 'doc', 'odt', 'odf', 'rtf', 'html', 'htm', 'txt'],
      },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };

  try {
    const { importEscribaFile } = await import('./escriba-files.mjs');
    return { ok: true, ...(await importEscribaFile(result.filePaths[0])) };
  } catch (error) {
    log.error('Escriba import error', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo abrir el documento.',
    };
  }
});

ipcMain.handle('escriba-import-document-from-url', async (_event, payload) => {
  const remoteUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
  const requestedName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : '';

  let parsedUrl;
  try {
    parsedUrl = new URL(remoteUrl);
  } catch {
    return { ok: false, error: 'La direccion del documento no es valida.' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { ok: false, error: 'Solo se pueden abrir documentos protegidos mediante HTTPS.' };
  }

  const safeName = path.basename(requestedName || 'documento.docx')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .slice(0, 140) || 'documento.docx';
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'escriba-adjunto-'));
  const temporaryFile = path.join(temporaryDirectory, safeName);

  try {
    const response = await fetch(parsedUrl, { redirect: 'error' });
    if (!response.ok) throw new Error(`No se pudo descargar el documento (${response.status}).`);

    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredSize) && declaredSize > 50 * 1024 * 1024) {
      throw new Error('El documento supera el limite de 50 MB para Escriba.');
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    if (fileBuffer.length > 50 * 1024 * 1024) {
      throw new Error('El documento supera el limite de 50 MB para Escriba.');
    }

    await fs.promises.writeFile(temporaryFile, fileBuffer);
    const { importEscribaFile } = await import('./escriba-files.mjs');
    return { ok: true, ...(await importEscribaFile(temporaryFile)) };
  } catch (error) {
    log.error('Escriba remote import error', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo abrir el documento en Escriba.',
    };
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
});

ipcMain.handle('save-despacho-backup', async (_event, payload) => {
  const requestedName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : '';
  const base64 = typeof payload?.base64 === 'string' ? payload.base64 : '';
  const automatic = payload?.automatic === true;
  const safeName = (path.basename(requestedName || 'Judicial-Managment-Respaldo.zip')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\.zip$/i, '')
    .slice(0, 140) || 'Judicial-Managment-Respaldo');

  if (!base64) return { ok: false, error: 'El respaldo no contiene datos.' };

  const backupBuffer = Buffer.from(base64, 'base64');
  if (!backupBuffer.length || backupBuffer.length > 750 * 1024 * 1024) {
    return { ok: false, error: 'El respaldo es invalido o supera el limite de 750 MB.' };
  }

  let filePath;
  if (automatic) {
    const backupDirectory = path.join(app.getPath('documents'), 'Judicial Managment', 'Respaldos');
    await fs.promises.mkdir(backupDirectory, { recursive: true });
    filePath = path.join(backupDirectory, `${safeName}.zip`);
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar respaldo del despacho',
      defaultPath: `${safeName}.zip`,
      filters: [{ name: 'Respaldo Judicial', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    filePath = result.filePath;
  }

  try {
    await fs.promises.writeFile(filePath, backupBuffer);
    return { ok: true, filePath, size: backupBuffer.length };
  } catch (error) {
    log.error('Despacho backup save error', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo guardar el respaldo.',
    };
  }
});

ipcMain.handle('escriba-export-document', async (_event, payload) => {
  if (!validateEscribaPayload(payload)) {
    return { ok: false, error: 'El documento no tiene un formato valido.' };
  }

  const format = String(payload.format ?? 'docx').toLowerCase();
  const formats = {
    docx: { extension: 'docx', name: 'Documento de Word' },
    doc: { extension: 'doc', name: 'Word 97-2003' },
    odt: { extension: 'odt', name: 'OpenDocument Text' },
    odf: { extension: 'odf', name: 'OpenDocument Format' },
    pdf: { extension: 'pdf', name: 'Documento PDF' },
    html: { extension: 'html', name: 'Pagina HTML' },
    txt: { extension: 'txt', name: 'Texto sin formato' },
  };
  const target = formats[format];
  if (!target) return { ok: false, error: 'Formato de exportacion no compatible.' };

  const safeTitle = payload.title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'Documento';
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: `Exportar ${target.name}`,
    defaultPath: `${safeTitle}.${target.extension}`,
    filters: [{ name: target.name, extensions: [target.extension] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };

  try {
    const {
      createEscribaDocx,
      createEscribaLegacyDoc,
      createEscribaOdt,
      getEscribaPrintableHtml,
    } = await import('./escriba-files.mjs');

    if (format === 'docx') {
      await fs.promises.writeFile(saveResult.filePath, await createEscribaDocx(payload));
    } else if (format === 'doc') {
      await fs.promises.writeFile(saveResult.filePath, await createEscribaLegacyDoc(payload));
    } else if (format === 'odt' || format === 'odf') {
      await fs.promises.writeFile(saveResult.filePath, await createEscribaOdt(payload));
    } else if (format === 'html') {
      await fs.promises.writeFile(saveResult.filePath, getEscribaPrintableHtml(payload), 'utf8');
    } else if (format === 'txt') {
      await fs.promises.writeFile(saveResult.filePath, String(payload.text ?? ''), 'utf8');
    } else {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getEscribaPrintableHtml(payload))}`);
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      });
      await fs.promises.writeFile(saveResult.filePath, pdf);
      printWindow.destroy();
    }

    return { ok: true, filePath: saveResult.filePath };
  } catch (error) {
    log.error('Escriba export error', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo exportar el documento.',
    };
  }
});

ipcMain.handle('escriba-print-document', async (_event, payload) => {
  if (!validateEscribaPayload(payload)) {
    return { ok: false, error: 'El documento no tiene un formato valido.' };
  }

  try {
    const { getEscribaPrintableHtml } = await import('./escriba-files.mjs');
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getEscribaPrintableHtml(payload))}`);

    return await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => {
          printWindow.destroy();
          resolve(success
            ? { ok: true }
            : { ok: false, error: failureReason || 'La impresion fue cancelada.' });
        },
      );
    });
  } catch (error) {
    log.error('Escriba print error', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo imprimir el documento.',
    };
  }
});

ipcMain.handle('get-app-update-state', () => ({ ...updateState }));

ipcMain.handle('check-for-app-update', async () => {
  return checkForAppUpdates({ manual: true });
});

ipcMain.handle('download-app-update', async () => {
  if (!app.isPackaged || isDevelopment) {
    return {
      ok: false,
      message: 'La descarga de parches solo funciona en la aplicacion instalada.',
    };
  }

  if (updateState.status !== 'available') {
    return {
      ok: false,
      message: 'No hay un parche pendiente de descarga.',
    };
  }

  sendUpdateState({
    status: 'downloading',
    percent: 0,
    message: `Preparando descarga del parche ${updateState.availableVersion ?? ''}...`,
  });

  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo descargar el parche.';
    sendUpdateState({ status: 'error', message });
    return { ok: false, message };
  }
});

ipcMain.handle('install-app-update', () => {
  if (updateState.status !== 'downloaded') {
    return {
      ok: false,
      message: 'El parche todavia no esta listo para instalar.',
    };
  }

  const macLocation = moveMacAppToApplicationsFolder();
  if (!macLocation.ok || macLocation.moved) {
    const message = macLocation.message ?? 'Prepara la instalación desde la carpeta Aplicaciones.';
    sendUpdateState({
      status: 'downloaded',
      message,
    });
    return { ok: false, message };
  }

  sendUpdateState({
    status: 'applying',
    percent: 100,
    message: 'Aplicando actualizacion local. Judicial se reiniciara automaticamente.',
  });

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { ok: true };
});

ipcMain.handle('get-hardware-profile', async () => {
  const cpus = os.cpus();
  const ollamaPlatformInfo = getOllamaPlatformInfo();
  const baseProfile = {
    platform: process.platform,
    osRelease: os.release(),
    macOSVersion: ollamaPlatformInfo.macOSVersion,
    macOSMajor: ollamaPlatformInfo.macOSMajor,
    legacyOllama: ollamaPlatformInfo.legacyMacOS,
    totalMemoryGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
    cpuModel: cpus[0]?.model ?? 'CPU no detectado',
    cpuThreads: cpus.length,
    cpuCores: Math.max(1, Math.round(cpus.length / 2)),
    gpus: [],
  };

  if (process.platform !== 'win32') return baseProfile;

  return new Promise((resolve) => {
    const command = [
      'Get-CimInstance Win32_VideoController',
      'Select-Object Name,AdapterRAM',
      'ConvertTo-Json -Compress',
    ].join(' | ');

    childProcess.execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout: 7000 },
      (_error, stdout) => {
        try {
          const parsed = JSON.parse(stdout || '[]');
          const entries = Array.isArray(parsed) ? parsed : [parsed];
          resolve({
            ...baseProfile,
            gpus: entries
              .filter((entry) => entry?.Name)
              .map((entry) => ({
                name: String(entry.Name),
                adapterRamGb: entry.AdapterRAM
                  ? Math.round((Number(entry.AdapterRAM) / 1024 / 1024 / 1024) * 10) / 10
                  : null,
              })),
          });
        } catch {
          resolve(baseProfile);
        }
      },
    );
  });
});

ipcMain.on('renderer-error', (_event, details) => {
  log.error('Renderer reported an error', {
    source: String(details?.source ?? 'unknown'),
    message: String(details?.message ?? 'Unknown renderer error'),
    stack: details?.stack ? String(details.stack) : undefined,
  });
});

ipcMain.handle('get-ollama-status', async () => {
  return checkOllamaStatus();
});

ipcMain.handle('get-juris-model-catalog', () => loadJurisModelCatalog());

ipcMain.handle('replace-juris-reference-cache', (_event, payload) => {
  return replaceCachedJurisReferences(payload);
});

ipcMain.handle('get-juris-reference-cache', (_event, despachoId) => {
  const normalizedDespachoId = typeof despachoId === 'string' ? despachoId.trim() : '';
  if (!normalizedDespachoId || !safeStorage.isEncryptionAvailable()) return [];
  return readJurisReferenceCache().references
    .filter((reference) => reference.despachoId === normalizedDespachoId)
    .map(({ despachoId: _despachoId, ...reference }) => reference);
});

ipcMain.handle('remove-juris-reference-cache', (_event, payload) => {
  const despachoId = typeof payload?.despachoId === 'string' ? payload.despachoId.trim() : '';
  const referenceId = typeof payload?.referenceId === 'string' ? payload.referenceId.trim() : '';
  if (!despachoId || !referenceId) return { ok: false, message: 'Referencia local no valida.' };
  const remaining = readJurisReferenceCache().references
    .filter((reference) => reference.despachoId !== despachoId || reference.id !== referenceId);
  return writeJurisReferenceCache(remaining);
});

ipcMain.handle('install-juris-model', async (_event, modelId) => {
  return runOllamaModelInstall(typeof modelId === 'string' ? modelId.trim() : '');
});

ipcMain.handle('cancel-juris-model-install', () => cancelOllamaModelInstall());

ipcMain.handle('check-ollama-status', async () => {
  sendOllamaState({
    status: 'checking',
    message: 'Revisando Ollama local...',
  });
  return checkOllamaStatus();
});

ipcMain.handle('select-ollama-location', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'Elegir ubicación de Ollama',
    buttonLabel: 'Usar esta ubicación',
    properties: ['openFile', 'openDirectory'],
    filters: process.platform === 'win32'
      ? [{ name: 'Ejecutables de Ollama', extensions: ['exe'] }]
      : [],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, canceled: true, message: 'No se cambió la ubicación de Ollama.' };
  }

  const resolvedPath = resolveOllamaLocation(result.filePaths[0]);
  if (!resolvedPath) {
    return {
      ok: false,
      message: 'Selecciona Ollama.app, el ejecutable ollama o una carpeta que lo contenga.',
    };
  }

  saveCustomOllamaPath(resolvedPath);
  const state = await checkOllamaStatus();
  return { ok: true, path: resolvedPath, state };
});

ipcMain.handle('clear-ollama-location', async () => {
  saveCustomOllamaPath(null);
  const state = await checkOllamaStatus();
  return { ok: true, state };
});

ipcMain.handle('copy-to-clipboard', (_event, value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { ok: false, message: 'No hay texto para copiar.' };
  if (text.length > 10_000) return { ok: false, message: 'El texto es demasiado largo para copiar.' };

  clipboard.writeText(text);
  return { ok: true };
});

const configureSessionSecurity = () => {
  const allowedPermissions = new Set(['notifications', 'geolocation', 'geolocation-approximate']);
  const isTrustedOrigin = (requestingUrl) => {
    if (typeof requestingUrl !== 'string') return false;
    if (isDevelopment) {
      return Boolean(process.env.VITE_DEV_SERVER_URL)
        && requestingUrl.startsWith(process.env.VITE_DEV_SERVER_URL);
    }
    return requestingUrl.startsWith('file:');
  };

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => (
    allowedPermissions.has(permission)
    && webContents === mainWindow?.webContents
    && isTrustedOrigin(requestingOrigin)
  ));

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const requestingUrl = webContents?.getURL?.() ?? '';
    callback(
      allowedPermissions.has(permission)
      && webContents === mainWindow?.webContents
      && isTrustedOrigin(requestingUrl),
    );
  });
};

app.whenReady().then(() => {
  configureSessionSecurity();
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  setupAutoUpdater();
  setupOllamaMonitor();

  const callbackUrl = process.argv.find((arg) => arg.startsWith(`${authProtocol}://`));
  if (callbackUrl) {
    mainWindow.once('ready-to-show', () => sendAuthCallback(callbackUrl));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
