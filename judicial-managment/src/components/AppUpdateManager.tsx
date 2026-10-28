import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';

const initialState: AppUpdateState = {
  status: 'idle',
  currentVersion: __APP_VERSION__,
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

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
};

export default function AppUpdateManager() {
  const [state, setState] = useState<AppUpdateState>(initialState);
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.judicialDesktop?.getAppUpdateState?.().then((nextState) => {
      if (mounted) setState(nextState);
    }).catch(() => undefined);

    const unsubscribe = window.judicialDesktop?.onAppUpdateStatus?.((nextState) => {
      setState(nextState);
      setActionError('');

      if (nextState.status === 'available' && nextState.availableVersion !== dismissedVersion) {
        setPanelOpen(true);
      }

      if (['downloading', 'downloaded'].includes(nextState.status)) {
        setPanelOpen(true);
      }

      if (nextState.status === 'applying') {
        setApplyingUpdate(true);
        setPanelOpen(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [dismissedVersion]);

  const releaseDate = useMemo(() => {
    if (!state.releaseDate) return null;
    const date = new Date(state.releaseDate);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
  }, [state.releaseDate]);

  const checkForUpdates = async () => {
    setActionError('');
    setPanelOpen(true);

    try {
      const nextState = await window.judicialDesktop?.checkForAppUpdate?.();
      if (nextState) setState(nextState);
    } catch {
      setActionError('No se pudo iniciar la comprobacion.');
    }
  };

  const downloadUpdate = async () => {
    setActionError('');
    const result = await window.judicialDesktop?.downloadAppUpdate?.();
    if (result && !result.ok) {
      setActionError(result.message ?? 'No se pudo descargar el parche.');
    }
  };

  const installUpdate = async () => {
    setActionError('');
    if (!window.judicialDesktop?.installAppUpdate) {
      setActionError('La instalacion automatica solo funciona en la aplicacion instalada.');
      return;
    }

    setApplyingUpdate(true);
    setPanelOpen(true);
    setState((current) => ({
      ...current,
      status: 'applying',
      message: 'Aplicando actualización local. Judicial se reiniciará automáticamente.',
    }));
    const result = await window.judicialDesktop.installAppUpdate();
    if (result && !result.ok) {
      setApplyingUpdate(false);
      setState((current) => ({
        ...current,
        status: 'downloaded',
      }));
      setActionError(result.message ?? 'No se pudo iniciar la instalacion.');
    }
  };

  const dismissAvailableUpdate = () => {
    setDismissedVersion(state.availableVersion);
    setPanelOpen(false);
  };

  const isApplying = applyingUpdate || state.status === 'applying';
  const canClose = !['downloaded', 'applying'].includes(state.status) && !isApplying;
  const showPanel = panelOpen && state.status !== 'idle';
  const hasPendingUpdate = ['available', 'downloading', 'downloaded', 'applying'].includes(state.status);
  const updateButtonLabel = state.status === 'available'
    ? `Actualizar a v${state.availableVersion}`
    : state.status === 'downloading'
      ? `Descargando ${Math.round(state.percent)}%`
      : state.status === 'downloaded'
        ? 'Aplicar actualización'
        : isApplying
          ? 'Aplicando actualización'
          : `Versión ${state.currentVersion}`;

  const handleUpdateButton = () => {
    if (hasPendingUpdate) {
      setPanelOpen(true);
      return;
    }
    void checkForUpdates();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleUpdateButton}
        className={`fixed bottom-2 right-2 z-40 inline-flex h-11 w-11 items-center justify-center gap-2 rounded-md border px-0 text-xs font-semibold shadow-lg transition-all hover:-translate-y-0.5 sm:bottom-4 sm:right-4 sm:w-auto sm:px-4 ${
          hasPendingUpdate
            ? 'border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300'
            : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
        title={hasPendingUpdate ? 'Abrir actualización disponible' : 'Buscar actualizaciones'}
        aria-label={updateButtonLabel}
      >
        {hasPendingUpdate ? (
          isApplying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className={`h-4 w-4 ${state.status === 'downloading' ? 'animate-bounce' : ''}`} />
          )
        ) : (
          <RefreshCw className={`h-4 w-4 ${state.status === 'checking' ? 'animate-spin' : ''}`} />
        )}
        <span className="hidden sm:inline">{updateButtonLabel}</span>
      </button>

      {showPanel && (
        <div className="fixed inset-0 z-[70] flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-4 backdrop-blur-sm">
          <section className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-2xl animate-slide-in-up dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-blue-100 bg-blue-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-white">
                  {state.status === 'downloaded' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : state.status === 'error' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : state.status === 'checking' || state.status === 'downloading' || isApplying ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    Actualizaciones de Judicial Managment
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
                    {state.status === 'available' && `Parche ${state.availableVersion} disponible`}
                    {state.status === 'downloading' && `Descargando parche ${state.availableVersion ?? ''}`}
                    {state.status === 'downloaded' && `Parche ${state.availableVersion} listo`}
                    {isApplying && 'Aplicando actualización'}
                    {state.status === 'checking' && 'Buscando actualizaciones'}
                    {state.status === 'not-available' && 'Aplicacion actualizada'}
                    {state.status === 'development' && 'Modo de desarrollo'}
                    {state.status === 'error' && 'No se pudo actualizar'}
                  </h2>
                </div>
              </div>
              {canClose && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-4 px-6 py-5">
              {isApplying ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-700 shadow-inner dark:bg-blue-950/40 dark:text-blue-200">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">Aplicando actualización</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    Estamos instalando el parche localmente. Judicial se cerrara y volvera a abrir automaticamente.
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{state.message}</p>
              )}

              {!isApplying && state.status === 'available' && (
                <>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <p className="font-semibold text-slate-950 dark:text-white">
                      {state.releaseName ?? `Parche ${state.availableVersion}`}
                    </p>
                    {releaseDate && <p className="mt-1 text-xs text-slate-500">Publicado: {releaseDate}</p>}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {state.releaseNotes || 'Incluye mejoras generales, correcciones y ajustes de estabilidad.'}
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    Tus expedientes y datos del despacho permanecen en la base de datos; el parche reemplaza solamente los archivos de la aplicacion.
                  </div>
                </>
              )}

              {!isApplying && state.status === 'downloading' && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>{formatBytes(state.transferred)} de {formatBytes(state.total)}</span>
                    <span>{Math.round(state.percent)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full bg-blue-700 transition-[width] duration-300"
                      style={{ width: `${Math.max(2, state.percent)}%` }}
                    />
                  </div>
                  {state.bytesPerSecond > 0 && (
                    <p className="mt-2 text-xs text-slate-500">{formatBytes(state.bytesPerSecond)}/s</p>
                  )}
                </div>
              )}

              {!isApplying && state.status === 'downloaded' && (
                <>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                    El parche ya está descargado. Al aplicarlo, Judicial instalará la actualización localmente y se abrirá de nuevo automáticamente.
                  </div>
                  {window.judicialDesktop?.platform === 'darwin' && !state.macInstallLocationReady && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      Para que macOS aplique el parche, Judicial debe estar en la carpeta Aplicaciones. Al continuar, la app intentará moverlo ahí y se reiniciará de forma segura.
                    </div>
                  )}
                </>
              )}

              {!isApplying && (actionError || state.status === 'error') && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                  {actionError || state.message}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end dark:border-slate-700 dark:bg-slate-800">
              {!isApplying && state.status === 'available' && (
                <>
                  <button
                    type="button"
                    onClick={dismissAvailableUpdate}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Ahora no
                  </button>
                  <button
                    type="button"
                    onClick={downloadUpdate}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                  >
                    <Download className="h-4 w-4" />
                    Descargar parche
                  </button>
                </>
              )}

              {!isApplying && state.status === 'downloading' && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Descargar en segundo plano
                </button>
              )}

              {!isApplying && state.status === 'downloaded' && (
                <button
                  type="button"
                  onClick={installUpdate}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                >
                  <Download className="h-4 w-4" />
                  Aplicar actualización
                </button>
              )}

              {!isApplying && ['not-available', 'development', 'error'].includes(state.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                  {state.status === 'error' && (
                    <button
                      type="button"
                      onClick={checkForUpdates}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Intentar de nuevo
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
