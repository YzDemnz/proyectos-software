import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LocateFixed, Loader2, MapPin, ShieldCheck, X } from 'lucide-react';
import { getRegionalProfileForState } from '../data/regionalCourts';
import {
  createManualRegionalContext,
  detectRegionalContextFromDevice,
  EMPTY_REGIONAL_CONTEXT,
  MEXICO_STATES,
  type RegionalLocationContext,
} from '../lib/regionalLocation';

interface RegionalLocationDialogProps {
  open: boolean;
  context: RegionalLocationContext;
  onClose: () => void;
  onSave: (context: RegionalLocationContext) => void;
}

export function RegionalLocationDialog({ open, context, onClose, onSave }: RegionalLocationDialogProps) {
  const [candidate, setCandidate] = useState<RegionalLocationContext>(context);
  const [manualMode, setManualMode] = useState(false);
  const [stateCode, setStateCode] = useState(context.stateCode);
  const [municipality, setMunicipality] = useState(context.municipality);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCandidate(context.status === 'unselected' ? EMPTY_REGIONAL_CONTEXT : context);
    setStateCode(context.stateCode);
    setMunicipality(context.municipality);
    setManualMode(context.status === 'unsupported' || context.status === 'error');
  }, [context, open]);

  const selectedProfile = useMemo(() => getRegionalProfileForState(stateCode), [stateCode]);
  const municipalityOptions = selectedProfile?.municipalities ?? [];

  if (!open) return null;

  const locateDevice = async () => {
    setLocating(true);
    setManualMode(false);
    const result = await detectRegionalContextFromDevice();
    setCandidate(result);
    setStateCode(result.stateCode);
    setMunicipality(result.municipality);
    setManualMode(result.status !== 'supported');
    setLocating(false);
  };

  const saveManual = () => {
    const result = createManualRegionalContext(stateCode, municipality);
    setCandidate(result);
    if (result.status === 'error') return;
    onSave(result);
  };

  const confirmCandidate = () => {
    if (candidate.status === 'supported' || candidate.status === 'unsupported') onSave(candidate);
  };

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/65 px-4 py-5" role="presentation">
      <section className="my-auto max-h-[calc(100dvh-2.5rem)] w-full max-w-2xl overflow-y-auto rounded-md border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="regional-location-title">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="regional-location-title" className="text-lg font-bold text-slate-950 dark:text-white">Configura tu región judicial</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Juris usa el estado y municipio para mostrar el catálogo disponible. Siempre podrás corregirlos.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Cerrar configuración regional">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="flex gap-3 border-y border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <p>La ubicación se consulta solo después de tu permiso. La comparación ocurre dentro de la app; no se guarda la IP, ni se almacenan o envían tus coordenadas.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void locateDevice()} disabled={locating} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {locating ? 'Consultando ubicación...' : 'Usar ubicación del equipo'}
            </button>
            <button type="button" onClick={() => setManualMode(true)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">
              <MapPin className="h-4 w-4" />
              Ingresar manualmente
            </button>
          </div>

          {candidate.status === 'supported' && candidate.source === 'device' && !manualMode && (
            <div className="border-y border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-900/60 dark:bg-blue-950/20">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-blue-950 dark:text-blue-100">Región aproximada encontrada</h3>
                  <p className="mt-1 text-sm text-blue-900 dark:text-blue-200">{candidate.municipality ? `${candidate.municipality}, ` : ''}{candidate.stateName}</p>
                  <p className="mt-2 text-xs leading-5 text-blue-800 dark:text-blue-300">El municipio se estima comparando la ubicación con las sedes disponibles. Confírmalo antes de cargar el catálogo.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={confirmCandidate} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Confirmar región</button>
                <button type="button" onClick={() => setManualMode(true)} className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-100 dark:hover:bg-slate-800">Corregir</button>
              </div>
            </div>
          )}

          {(candidate.status === 'unsupported' || candidate.status === 'error') && (
            <div className="flex gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="font-semibold">{candidate.status === 'unsupported' ? 'No disponible en tu región' : 'No se pudo usar la ubicación'}</p>
                <p className="mt-1 leading-5">{candidate.message}</p>
              </div>
            </div>
          )}

          {manualMode && (
            <form onSubmit={(event) => { event.preventDefault(); saveManual(); }} className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Estado
                  <select value={stateCode} onChange={(event) => { setStateCode(event.target.value); setMunicipality(''); }} required className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                    <option value="">Selecciona un estado</option>
                    {MEXICO_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Municipio o alcaldía
                  <input value={municipality} onChange={(event) => setMunicipality(event.target.value)} list="regional-municipality-options" placeholder="Escribe tu municipio" required className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                  <datalist id="regional-municipality-options">
                    {municipalityOptions.map((item) => <option key={item} value={item} />)}
                  </datalist>
                </label>
              </div>

              {stateCode && !selectedProfile && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">No disponible en tu región. Podrás usar la app y capturar el juzgado manualmente.</p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Ahora no</button>
                <button type="submit" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Guardar región</button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export function RegionalLocationSummary({ context, onOpen }: { context: RegionalLocationContext; onOpen: () => void }) {
  const available = context.status === 'supported';
  return (
    <div className="flex flex-col gap-4 border-y border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${available ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-950 dark:text-white">{context.stateName || 'Región pendiente'}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {available
              ? `${context.municipality ? `${context.municipality} · ` : ''}Catálogo regional disponible`
              : context.status === 'unsupported' ? 'No disponible en tu región' : 'Selecciona un estado y municipio'}
          </p>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="shrink-0 rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-slate-800">Cambiar región</button>
    </div>
  );
}
