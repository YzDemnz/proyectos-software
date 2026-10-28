import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Loader2 as LoaderCircle, UserRound } from 'lucide-react';
import { supabase, type DespachoMember } from '../lib/supabase';
import { WebBrand } from './WebEntry';

type WorkspaceResult = { state: 'ready'; membership: DespachoMember } | { state: 'onboarding' | 'unavailable'; message?: string };
export default function WebOnboarding({ userId, onSelectDespacho }: { userId: string; userEmail: string; onSelectDespacho: (membership: DespachoMember) => void }) {
  const [stage, setStage] = useState<'loading' | 'office' | 'person' | 'creating' | 'error'>('loading');
  const [office, setOffice] = useState('');
  const [joining, setJoining] = useState(false);
  const [person, setPerson] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const callback = useRef(onSelectDespacho);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  useEffect(() => { callback.current = onSelectDespacho; }, [onSelectDespacho]);
  useEffect(() => {
    let alive = true;
    setStage('loading'); setError('');
    void Promise.resolve(supabase.rpc('ensure_web_workspace')).then(({ data, error: failure }) => {
      if (!alive) return;
      if (failure) { setError('No pudimos abrir tu despacho. Intenta de nuevo.'); setStage('error'); return; }
      const result = data as WorkspaceResult;
      if (result.state === 'ready') callback.current(result.membership);
      else if (result.state === 'onboarding') setStage('office');
      else { setUnavailable(true); setError(result.message || 'Tu despacho no está disponible. Revisa su estado desde escritorio o contacta a su propietario.'); setStage('error'); }
    }).catch(() => { if (alive) { setError('No pudimos conectar. Comprueba tu conexión.'); setStage('error'); } });
    return () => { alive = false; };
  }, [userId, retry]);
  useEffect(() => { if (stage === 'office' || stage === 'person') input.current?.focus(); }, [stage]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (stage === 'office') { if (office.trim().length < 2) { setError('Escribe al menos 2 caracteres para tu despacho.'); return; } setOffice(office.trim()); setStage('person'); return; }
    if (stage !== 'person' || submitting.current) return;
    if (person.trim().length < 2) { setError('Escribe tu nombre para continuar.'); return; }
    submitting.current = true; setStage('creating');
    try {
      const { data, error: failure } = joining
        ? await supabase.rpc('join_web_workspace', { invitation_code: office.trim(), nombre_personal: person.trim() })
        : await supabase.rpc('ensure_web_workspace', { despacho_nombre: office.trim(), nombre_personal: person.trim() });
      if (failure) throw failure;
      const result = data as WorkspaceResult;
      if (result.state !== 'ready') throw new Error(result.message || 'No se pudo crear tu despacho.');
      callback.current(result.membership);
    } catch (failure) {
      setError((failure as { message?: string })?.message || 'No pudimos completar la creación. Puedes reintentar sin duplicar tu despacho.'); setStage('person');
    } finally { submitting.current = false; }
  }
  const loading = stage === 'loading' || stage === 'creating';
  return <main className="web-onboarding"><header className="web-entry-header"><WebBrand /><button className="web-text-button" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Cerrar sesión</button></header>
    <section className="web-onboarding-card" aria-live="polite">
      {loading ? <div className="web-onboarding-loading"><div className="web-setup-orbit"><Building2 /><LoaderCircle className="animate-spin" /></div><h1>{stage === 'creating' ? 'Tu despacho toma forma' : 'Abriendo tu despacho'}</h1><p>{stage === 'creating' ? `Estamos preparando ${office} para ti, ${person.trim().split(' ')[0]}.` : 'Un momento. Estamos conectando tu espacio de trabajo.'}</p><span className="web-progress-track"><span /></span></div> : stage === 'error' ? <><h1>{unavailable ? 'Tu despacho necesita atención' : 'No pudimos conectar'}</h1><p className="web-error" role="alert">{error}</p><button className="web-primary" onClick={() => { setUnavailable(false); setRetry(value => value + 1); }}>Volver a intentar</button></> : <>
        <ol className="web-steps" aria-label="Configuración de tu despacho"><li className={stage === 'person' ? 'complete' : 'active'}>{stage === 'person' ? <Check /> : <span>1</span>}<span>Tu despacho</span></li><li className={stage === 'person' ? 'active' : ''}><span>2</span><span>Tu nombre</span></li></ol>
        <form key={stage} className="web-step-panel" onSubmit={submit}><div className="web-form-symbol">{stage === 'office' ? <Building2 /> : <UserRound />}</div><p className="web-eyebrow">{stage === 'office' ? 'EMPECEMOS POR LO TUYO' : 'UN GUSTO CONOCERTE'}</p><h1>{stage === 'office' ? (joining ? 'Entra con tu invitación' : '¿Cómo se llama tu despacho?') : '¿Cuál es tu nombre?'}</h1><p>{stage === 'office' ? 'Será el espacio donde tú y tu equipo trabajarán cada día.' : (joining ? 'Así aparecerás ante tu equipo.' : `Así aparecerás ante tu equipo en ${office}.`)}</p><label htmlFor="setup-value">{stage === 'office' ? (joining ? 'Código de invitación' : 'Nombre del despacho') : 'Tu nombre'}</label><input ref={input} id="setup-value" autoComplete={stage === 'office' ? 'organization' : 'name'} required minLength={2} maxLength={stage === 'office' ? 120 : 60} placeholder={stage === 'office' ? (joining ? 'Código que te compartió tu equipo' : 'Ej. Ramírez & Asociados') : 'Ej. Sofía Ramírez'} value={stage === 'office' ? office : person} onChange={event => stage === 'office' ? setOffice(event.target.value) : setPerson(event.target.value)} />{error && <p className="web-error" role="alert">{error}</p>}<button className="web-primary" type="submit">{stage === 'office' ? 'Continuar' : (joining ? 'Unirme a mi despacho' : 'Crear mi despacho')}<ArrowRight /></button>{stage === 'person' && <button type="button" className="web-text-button" onClick={() => { setStage('office'); setError(''); }}><ArrowLeft />Volver al nombre del despacho</button>}</form>
        <button type="button" className="web-text-button" disabled={stage !== 'office'} onClick={() => { setJoining(!joining); setOffice(''); setError(''); }}>{joining ? 'Crear un despacho nuevo' : 'Tengo un código de invitación'}</button><div className="web-setup-footnote"><span className="web-status-dot" />Un solo despacho en la web, conectado con tu app de escritorio.</div>
      </>}
    </section><footer className="web-entry-footer">Judicial Managment<span>Todo listo para tu próximo asunto.</span></footer>
  </main>;
}
