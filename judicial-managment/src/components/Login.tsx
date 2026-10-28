import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, Chrome, CreditCard, Eye, EyeOff, KeyRound, LockKeyhole, Mail, MailCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthRedirectUrl, getEmailConfirmationRedirectUrl, getPasswordRecoveryPortalUrl, needsMfaChallenge, verifyMfaCode } from '../lib/authSecurity';
import appIconUrl from '../../assets/icons/icon.png';
import {
  getRememberedEmail,
  getRememberSessionPreference,
  setRememberedEmail,
  setRememberSessionPreference,
} from '../lib/authStorage';

interface LoginProps {
  onLoginSuccess: () => void;
}

type AuthStep = 'credentials' | 'mfa';
const GOOGLE_AUTH_ENABLED = false;
const MERCADO_PAGO_PAYMENT_URL = 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_plan_id=8cb4ab0ac7d343e4a97a31451831f58a';

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<AuthStep>('credentials');
  const [email, setEmail] = useState(() => getRememberedEmail());
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberSession, setRememberSession] = useState(() => getRememberSessionPreference());
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [displayMode, setDisplayMode] = useState<WindowPresentation['displayMode']>(() => (
    window.innerWidth < 1100 || window.innerHeight < 700 ? 'compact' : window.innerWidth >= 1560 ? 'wide' : 'standard'
  ));
  const [reduceMotion, setReduceMotion] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const motionFrameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const updateBrowserPresentation = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / Math.max(height, 1);
      setDisplayMode(width < 1100 || height < 700 ? 'compact' : width >= 1800 && aspectRatio >= 1.85 ? 'ultrawide' : width >= 1560 ? 'wide' : 'standard');
    };
    const getDesktopPresentation = async () => {
      const getPresentation = window.judicialDesktop?.getWindowPresentation;
      if (!getPresentation) return;

      const presentation = await getPresentation().catch(() => null);
      if (presentation) {
        setIsFullscreen(presentation.fullScreen);
        setDisplayMode(presentation.displayMode);
      }
    };

    getDesktopPresentation();
    document.addEventListener('fullscreenchange', updateBrowserPresentation);
    window.addEventListener('resize', updateBrowserPresentation);
    const unsubscribe = window.judicialDesktop?.onWindowPresentation?.((presentation) => {
      setIsFullscreen(presentation.fullScreen);
      setDisplayMode(presentation.displayMode);
    });

    return () => {
      document.removeEventListener('fullscreenchange', updateBrowserPresentation);
      window.removeEventListener('resize', updateBrowserPresentation);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduceMotion(media.matches);

    updatePreference();
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => () => {
    if (motionFrameRef.current !== null) cancelAnimationFrame(motionFrameRef.current);
  }, []);

  const updateHeroMotion = (x: number, y: number) => {
    if (reduceMotion || !heroRef.current) return;
    pointerRef.current = { x, y };

    if (motionFrameRef.current !== null) return;
    motionFrameRef.current = requestAnimationFrame(() => {
      motionFrameRef.current = null;
      const { x: nextX, y: nextY } = pointerRef.current;
      const style = heroRef.current?.style;
      if (!style) return;

      style.setProperty('--hero-orbit-one-x', `${nextX * 18}px`);
      style.setProperty('--hero-orbit-one-y', `${nextY * 18}px`);
      style.setProperty('--hero-orbit-two-x', `${nextX * -12}px`);
      style.setProperty('--hero-orbit-two-y', `${nextY * -12}px`);
      style.setProperty('--hero-particle-one-x', `${nextX * 26}px`);
      style.setProperty('--hero-particle-one-y', `${nextY * 26}px`);
      style.setProperty('--hero-particle-two-x', `${nextX * -20}px`);
      style.setProperty('--hero-particle-two-y', `${nextY * -20}px`);
      style.setProperty('--hero-particle-three-x', `${nextX * 30}px`);
      style.setProperty('--hero-particle-three-y', `${nextY * -24}px`);
    });
  };

  const handleHeroPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    updateHeroMotion(x, y);
  };

  const resetHeroMotion = () => updateHeroMotion(0, 0);

  const finishLogin = async () => {
    const mustVerifyMfa = await needsMfaChallenge();

    if (mustVerifyMfa) {
      setStep('mfa');
      setNotice('Ingresa el codigo de tu app autenticadora para completar el acceso.');
      return;
    }

    setEmail('');
    setPassword('');
    onLoginSuccess();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      await setRememberSessionPreference(rememberSession);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        setRememberedEmail(email);
        await finishLogin();
      }
    } catch {
      setError('Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailConfirmationRedirectUrl(),
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        setNotice('Cuenta creada. Revisa tu correo real y confirma la cuenta en la página web antes de iniciar sesión.');
        setEmail('');
        setPassword('');
        setIsLogin(true);
      }
    } catch {
      setError('Error al crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setNotice('');

    if (!GOOGLE_AUTH_ENABLED) {
      setError('Google todavía no está configurado en Supabase. Por ahora inicia sesión con correo y contraseña.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
          skipBrowserRedirect: Boolean(window.judicialDesktop?.openExternalUrl),
        },
      });

      if (googleError) {
        setError(googleError.message);
        return;
      }

      if (data.url && window.judicialDesktop?.openExternalUrl) {
        const opened = await window.judicialDesktop.openExternalUrl(data.url);
        if (!opened) {
      setError('No se pudo abrir el navegador para iniciar sesión con Google.');
        }
      }
    } catch {
      setError('Google no esta configurado todavia en Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const recoveryUrl = getPasswordRecoveryPortalUrl();
      if (window.judicialDesktop?.openExternalUrl) {
        const opened = await window.judicialDesktop.openExternalUrl(recoveryUrl);
        if (!opened) throw new Error('No se pudo abrir el portal seguro.');
      } else {
        window.open(recoveryUrl, '_blank', 'noopener,noreferrer');
      }
      setNotice('Abrimos el portal seguro para confirmar tu correo y restablecer tu contraseña.');
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'No se pudo abrir la recuperación segura.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentLink = async () => {
    if (window.judicialDesktop?.openExternalUrl) {
      const opened = await window.judicialDesktop.openExternalUrl(MERCADO_PAGO_PAYMENT_URL);
      if (!opened) {
        setError('No se pudo abrir Mercado Pago en el navegador.');
      }
      return;
    }

    window.open(MERCADO_PAGO_PAYMENT_URL, '_blank', 'noopener,noreferrer');
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyMfaCode(mfaCode.trim());
      setMfaCode('');
      setEmail('');
      setPassword('');
      onLoginSuccess();
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : 'Código de verificación inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (isLogin) {
      handleLogin(e);
    } else {
      handleRegister(e);
    }
  };

  const handleCancelMfa = async () => {
    await supabase.auth.signOut();
    setStep('credentials');
    setMfaCode('');
    setNotice('');
    setError('');
  };

  const expandedLogin = isFullscreen || displayMode === 'wide' || displayMode === 'ultrawide';

  return (
    <main className={`login-screen-${displayMode} h-screen overflow-y-auto bg-[#eaf1fb] font-sans text-slate-950 dark:bg-[#070d18] ${displayMode === 'compact' ? 'p-2 sm:p-3' : isFullscreen ? 'p-4 lg:p-5' : 'p-3 sm:p-5 lg:p-7'}`}>
      <section className={`mx-auto grid min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-[#101927] lg:grid-cols-[1.05fr_0.95fr] ${expandedLogin ? 'max-w-none lg:grid-cols-[1.16fr_0.84fr]' : 'max-w-[1440px]'}`}>
        <aside ref={heroRef} onPointerMove={handleHeroPointerMove} onPointerLeave={resetHeroMotion} className="relative hidden overflow-hidden bg-[#071526] p-10 text-white lg:flex lg:flex-col" style={{ '--hero-orbit-one-x': '0px', '--hero-orbit-one-y': '0px', '--hero-orbit-two-x': '0px', '--hero-orbit-two-y': '0px', '--hero-particle-one-x': '0px', '--hero-particle-one-y': '0px', '--hero-particle-two-x': '0px', '--hero-particle-two-y': '0px', '--hero-particle-three-x': '0px', '--hero-particle-three-y': '0px' } as React.CSSProperties}>
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-24 h-80 w-80 rounded-full border border-blue-300/30 transition-transform duration-700 ease-out" style={{ transform: 'translate3d(var(--hero-orbit-one-x), var(--hero-orbit-one-y), 0)' }} />
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-40 h-56 w-56 rounded-full border border-amber-300/30 transition-transform duration-500 ease-out" style={{ transform: 'translate3d(var(--hero-orbit-two-x), var(--hero-orbit-two-y), 0)' }} />
          <div aria-hidden="true" className="pointer-events-none absolute right-44 top-28 h-3 w-3 rounded-full bg-blue-300/90 shadow-[0_0_22px_rgba(147,197,253,0.9)] transition-transform duration-300 ease-out" style={{ transform: 'translate3d(var(--hero-particle-one-x), var(--hero-particle-one-y), 0)' }} />
          <div aria-hidden="true" className="pointer-events-none absolute right-24 top-72 h-2.5 w-2.5 rounded-full bg-amber-300/90 shadow-[0_0_18px_rgba(252,211,77,0.75)] transition-transform duration-500 ease-out" style={{ transform: 'translate3d(var(--hero-particle-two-x), var(--hero-particle-two-y), 0)' }} />
          <div aria-hidden="true" className="pointer-events-none absolute right-72 bottom-32 h-2 w-2 rounded-full bg-emerald-300/90 shadow-[0_0_14px_rgba(110,231,183,0.85)] transition-transform duration-700 ease-out" style={{ transform: 'translate3d(var(--hero-particle-three-x), var(--hero-particle-three-y), 0)' }} />
          <div className="relative flex items-center gap-3">
            <img src={appIconUrl} alt="" className="h-12 w-12 drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]" />
            <div>
              <h1 className="text-lg font-bold">Judicial Managment</h1>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">MR Legal</p>
            </div>
          </div>

          <div className="relative my-auto max-w-xl py-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Espacio jurídico privado
            </span>
            <h2 className="mt-6 text-5xl font-bold leading-[1.04]">Tu despacho, claro y bajo control.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
              Accede a expedientes, movimientos, agenda y colaboración desde un entorno diseñado para la práctica jurídica.
            </p>
          </div>

          <div className="relative grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-semibold">Acceso protegido</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Correo verificado, 2FA y permisos por despacho.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <Building2 className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-semibold">Trabajo en equipo</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Cada despacho mantiene sus datos separados.</p>
            </div>
          </div>
        </aside>

        <div className="flex min-h-full items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
          <div className="w-full max-w-md animate-slide-in-up">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <img src={appIconUrl} alt="" className="h-10 w-10" />
                <div>
                  <p className="font-bold text-slate-950 dark:text-white">Judicial Managment</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">MR Legal</p>
                </div>
              </div>
              <LockKeyhole className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                {error}
              </div>
            )}

            {notice && (
              <div className="mb-4 flex gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                <MailCheck className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                <p>{notice}</p>
              </div>
            )}

            {step === 'mfa' ? (
              <form onSubmit={handleVerifyMfa} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">Verificación en 2 pasos</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Ingresa el código de seis dígitos de tu aplicación autenticadora.</p>
                </div>
                <label className="mt-7 block text-sm font-semibold text-slate-700 dark:text-slate-200">Código de seguridad</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                  required
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.45em] text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
                  placeholder="000000"
                />
                <button type="submit" disabled={loading || mfaCode.length < 6} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? 'Verificando...' : 'Verificar y entrar'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
                <button type="button" onClick={handleCancelMfa} className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              </form>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
                <div className="mb-7">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Acceso seguro</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{isLogin ? 'Inicia sesión para continuar con tu despacho.' : 'Regístrate para organizar tu trabajo jurídico.'}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Correo electrónico
                    <span className="relative mt-2 block">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-700 dark:text-blue-300" />
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950" placeholder="tu@correo.com" />
                    </span>
                  </label>

                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Contraseña
                    <span className="relative mt-2 block">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-700 dark:text-blue-300" />
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={isLogin ? 'current-password' : 'new-password'} className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-11 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950" placeholder="Mínimo 6 caracteres" />
                      <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-blue-700 dark:hover:text-blue-300" title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>

                  {isLogin && <button type="button" onClick={handlePasswordRecovery} disabled={loading} className="text-sm font-semibold text-blue-700 transition hover:text-blue-900 disabled:opacity-50 dark:text-blue-300">¿Olvidaste tu contraseña?</button>}

                  {isLogin && (
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={rememberSession}
                        onChange={(event) => setRememberSession(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>
                        <span className="block font-semibold text-slate-700 dark:text-slate-200">Mantener sesión iniciada</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">La sesión se protege con el cifrado de este equipo. La contraseña no se guarda.</span>
                      </span>
                    </label>
                  )}

                  <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white shadow-[0_10px_22px_rgba(29,78,216,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading ? 'Procesando...' : isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>

                {GOOGLE_AUTH_ENABLED && (
                  <>
                    <div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /><span className="text-xs text-slate-400">o continúa con</span><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /></div>
                    <button type="button" onClick={handleGoogleLogin} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Chrome className="h-5 w-5" />Google</button>
                  </>
                )}

                <div className="mt-7 border-t border-slate-200 pt-5 text-center dark:border-slate-700">
                  <p className="text-sm text-slate-500 dark:text-slate-400">{isLogin ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'}</p>
                  <button type="button" onClick={() => { setIsLogin((current) => !current); setError(''); setNotice(''); setPassword(''); }} className="mt-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900 dark:text-blue-300">{isLogin ? 'Crear una cuenta' : 'Iniciar sesión'}</button>
                </div>

                <button type="button" onClick={handlePaymentLink} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"><CreditCard className="h-4 w-4" />Suscripción y apoyo a la beta</button>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" />Datos protegidos</span>
              <span className="inline-flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-300" />Despachos separados</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
