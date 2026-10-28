import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 as LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import App from '../App';
import { supabase } from '../lib/supabase';
import { getEmailConfirmationRedirectUrl, getPasswordRecoveryPortalUrl, needsMfaChallenge, verifyMfaCode } from '../lib/authSecurity';
import { getRememberedEmail, getRememberSessionPreference, setRememberedEmail, setRememberSessionPreference } from '../lib/authStorage';
import BrandMark from './BrandMark';
import './web.css';

export function WebBrand() {
  return <a className="web-brand" href="/" aria-label="Judicial Managment, inicio"><BrandMark /><span>Judicial<br />Managment<small>WEB</small></span></a>;
}

export function WebLogin({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState(getRememberedEmail);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(getRememberSessionPreference);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await setRememberSessionPreference(remember);
      if (register) {
        const { data, error: failure } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: getEmailConfirmationRedirectUrl() } });
        if (failure) throw failure;
        if (!data.session) {
          setNotice('Revisa tu correo para confirmar la cuenta. Después vuelve aquí e inicia sesión para crear tu despacho.');
          setRegister(false); setPassword('');
        }
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (failure) throw failure;
        setRememberedEmail(email);
        setPassword('');
        onLoginSuccess?.();
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String((failure as { message?: string })?.message ?? '');
      setError(/Invalid login credentials/i.test(message) ? 'El correo o la contraseña no son correctos.' : /Email not confirmed/i.test(message) ? 'Confirma tu correo antes de entrar.' : /rate limit|too many/i.test(message) ? 'Espera unos minutos antes de volver a intentarlo.' : message || 'No pudimos conectar. Inténtalo de nuevo.');
    } finally { setBusy(false); }
  }

  return <main className="web-entry">
    <header className="web-entry-header"><WebBrand /><span className="web-header-note">Tu cuenta de siempre, también en la web</span></header>
    <div className="web-access-layout">
      <section className="web-access-intro"><p className="web-eyebrow">TU DESPACHO, CONTIGO</p><h1>El trabajo continúa.<br /><em>Donde estés.</em></h1><p>Accede a tus expedientes, documentos y agenda con la misma cuenta que usas en escritorio.</p><div className="web-access-note"><ShieldCheck aria-hidden="true" /><span>Un despacho conectado.<br />Tu equipo y tus datos en un mismo lugar.</span></div><span className="web-edition">JUDICIAL MANAGMENT / EDICIÓN WEB</span></section>
      <section className="web-form-card" aria-labelledby="access-title"><div className="web-form-symbol"><LockKeyhole aria-hidden="true" /></div><h2 id="access-title">{register ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2><p>{register ? 'Después configuraremos tu despacho en dos pasos.' : 'Entra directamente a tu despacho.'}</p>
        <form onSubmit={submit}>
          <label htmlFor="web-email">Correo electrónico</label><div className="web-input-icon"><Mail aria-hidden="true" /><input id="web-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@despacho.com" disabled={busy} /></div>
          <label htmlFor="web-password">Contraseña</label><div className="web-password"><input id="web-password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={register ? 'Al menos 8 caracteres' : 'Tu contraseña'} disabled={busy} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{visible ? <EyeOff /> : <Eye />}</button></div>
          <div className="web-form-options"><label className="web-checkbox"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy} />Recordarme</label>{!register && <a href={getPasswordRecoveryPortalUrl()} target="_blank" rel="noreferrer">Olvidé mi contraseña</a>}</div>
          {error && <p className="web-error" role="alert">{error}</p>}{notice && <p className="web-notice" role="status">{notice}</p>}
          <button className="web-primary" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" />Conectando…</> : <>{register ? 'Crear cuenta' : 'Entrar a mi despacho'}<ArrowRight /></>}</button>
        </form>
        <p className="web-switch">{register ? '¿Ya tienes una cuenta?' : '¿Es tu primera vez?'} <button type="button" disabled={busy} onClick={() => { setRegister(!register); setError(''); setNotice(''); }}>{register ? 'Inicia sesión' : 'Crear cuenta'}</button></p>
      </section>
    </div><footer className="web-entry-footer">Judicial Managment<span>La misma cuenta. El mismo trabajo.</span></footer>
  </main>;
}

export default function WebEntry() {
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<'loading' | 'login' | 'mfa' | 'ready' | 'error'>('loading');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const verifiedUser = useRef<string | null>(null);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { verifiedUser.current = null; setAccess('login'); return; }
      // Do not await Supabase calls inside the auth callback: the client holds its lock.
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      // SIGNED_IN also fires when a tab regains focus; keep unsaved forms mounted.
      if (session?.user.id !== verifiedUser.current) setAccess('loading');
      setRevision(value => value + 1);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) { if (active) setAccess('login'); return; }
        const { error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const mfa = await needsMfaChallenge();
        if (active) { verifiedUser.current = session.user.id; setAccess(mfa ? 'mfa' : 'ready'); }
      } catch { if (active) { setError('No pudimos verificar tu sesión. Comprueba tu conexión y vuelve a intentar.'); setAccess('error'); } }
    }
    void check(); return () => { active = false; };
  }, [revision]);
  if (access === 'ready') return <App />;
  if (access === 'login') return <WebLogin />;
  if (access === 'loading') return <main className="web-loading"><WebBrand /><LoaderCircle className="animate-spin" aria-hidden="true" /><p role="status">Verificando tu acceso…</p></main>;
  return <main className="web-loading"><WebBrand /><section className="web-form-card"><h1>{access === 'mfa' ? 'Verifica tu identidad' : 'Revisemos la conexión'}</h1>{access === 'mfa' && <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await verifyMfaCode(code); setCode(''); setRevision(value => value + 1); } catch { setError('El código no es válido o venció. Inténtalo de nuevo.'); } finally { setBusy(false); } }}><label htmlFor="web-mfa">Código de tu app autenticadora</label><input id="web-mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /><button className="web-primary" disabled={busy}>Verificar y entrar<ArrowRight /></button></form>}{error && <p className="web-error" role="alert">{error}</p>}{access === 'error' && <button className="web-primary" onClick={() => { setAccess('loading'); setRevision(value => value + 1); }}>Reintentar</button>}<button className="web-text-button" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Cerrar sesión</button></section></main>;
}
