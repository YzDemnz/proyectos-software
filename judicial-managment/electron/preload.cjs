const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('judicialDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getWindowPresentation: () => ipcRenderer.invoke('get-window-presentation'),
  getSecureAuthValue: (key) => ipcRenderer.invoke('get-secure-auth-value', key),
  setSecureAuthValue: (key, value) => ipcRenderer.invoke('set-secure-auth-value', { key, value }),
  removeSecureAuthValue: (key) => ipcRenderer.invoke('remove-secure-auth-value', key),
  clearSecureAuthValues: () => ipcRenderer.invoke('clear-secure-auth-values'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  extractDocumentText: (payload) => ipcRenderer.invoke('extract-document-text', payload),
  importEscribaDocument: () => ipcRenderer.invoke('escriba-import-document'),
  importEscribaDocumentFromUrl: (payload) => ipcRenderer.invoke('escriba-import-document-from-url', payload),
  exportEscribaDocument: (payload) => ipcRenderer.invoke('escriba-export-document', payload),
  printEscribaDocument: (payload) => ipcRenderer.invoke('escriba-print-document', payload),
  saveDespachoBackup: (payload) => ipcRenderer.invoke('save-despacho-backup', payload),
  getHardwareProfile: () => ipcRenderer.invoke('get-hardware-profile'),
  getOllamaStatus: () => ipcRenderer.invoke('get-ollama-status'),
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  getJurisModelCatalog: () => ipcRenderer.invoke('get-juris-model-catalog'),
  replaceJurisReferenceCache: (payload) => ipcRenderer.invoke('replace-juris-reference-cache', payload),
  getJurisReferenceCache: (despachoId) => ipcRenderer.invoke('get-juris-reference-cache', despachoId),
  removeJurisReferenceCache: (payload) => ipcRenderer.invoke('remove-juris-reference-cache', payload),
  installJurisModel: (modelId) => ipcRenderer.invoke('install-juris-model', modelId),
  cancelJurisModelInstall: () => ipcRenderer.invoke('cancel-juris-model-install'),
  selectOllamaLocation: () => ipcRenderer.invoke('select-ollama-location'),
  clearOllamaLocation: () => ipcRenderer.invoke('clear-ollama-location'),
  reportRendererError: (details) => ipcRenderer.send('renderer-error', details),
  getAppUpdateState: () => ipcRenderer.invoke('get-app-update-state'),
  checkForAppUpdate: () => ipcRenderer.invoke('check-for-app-update'),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  onAppUpdateStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('app-update-status', listener);

    return () => ipcRenderer.removeListener('app-update-status', listener);
  },
  onOllamaStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('ollama-status', listener);

    return () => ipcRenderer.removeListener('ollama-status', listener);
  },
  onJurisModelInstallStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('ollama-model-install-status', listener);

    return () => ipcRenderer.removeListener('ollama-model-install-status', listener);
  },
  onAuthCallback: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on('auth-callback-url', listener);

    return () => ipcRenderer.removeListener('auth-callback-url', listener);
  },
  onWindowPresentation: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window-presentation', listener);

    return () => ipcRenderer.removeListener('window-presentation', listener);
  },
});
