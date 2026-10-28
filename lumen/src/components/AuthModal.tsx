import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, User, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CodeInput } from '@/components/CodeInput';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup';

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
};

export function AuthModal({ open, onClose, initialMode = 'login' }: AuthModalProps) {
  const { signIn, signUp, signOut, mfaPending, verifyMFA, passwordRecovery, finishPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaVerifying, setMfaVerifying] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setSuccess(null);
      setResetRequested(false);
    }
  }, [open, initialMode]);

  if (!open && !mfaPending && !passwordRecovery) return null;

  const resetState = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setUsername('');
    setError(null);
    setSuccess(null);
    setVerificationEmail('');
    setResetRequested(false);
    setMfaCode('');
    setMfaError(null);
    setShowPassword(false);
  };

  const friendlyAuthError = (message: string) => {
    if (/email not confirmed/i.test(message)) return 'Confirma tu correo antes de iniciar sesión.';
    if (/invalid login credentials/i.test(message)) return 'El correo o la contraseña no son correctos.';
    if (/rate limit|too many/i.test(message)) return 'Espera unos minutos antes de volver a intentarlo.';
    return message;
  };

  const resendConfirmation = async () => {
    if (!verificationEmail || loading) return;
    setLoading(true);
    setError(null);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: verificationEmail,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setLoading(false);
    if (resendError) {
      setError(friendlyAuthError(resendError.message));
      return;
    }
    setSuccess('Enlace reenviado. Revisa tu correo, confirma la cuenta y vuelve a LUMEN para iniciar sesión.');
  };

  const handleClose = async () => {
    if (loading || mfaVerifying) return;
    try {
      // Canceling a challenge must discard the password-only session.
      if (mfaPending || passwordRecovery) await signOut();
      resetState();
      onClose();
    } catch {
      setMfaError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
    if (passwordRecovery) {
      if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      finishPasswordRecovery();
      setPassword('');
      setSuccess('Tu contraseña se actualizó. Ya puedes continuar en Lumen.');
    } else if (resetRequested) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (resetError) throw resetError;
      setSuccess('Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.');
    } else if (mode === 'login') {
      const { error, needsMFA } = await signIn(email.trim(), password);
      if (error) {
        setError(friendlyAuthError(error.message));
        setLoading(false);
        return;
      }
      if (!needsMFA) {
        resetState();
        onClose();
      }
    } else {
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.');
        setLoading(false);
        return;
      }
      const { error, needsConfirmation } = await signUp(email.trim(), password, fullName.trim(), username);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (needsConfirmation) {
        setPassword('');
        setVerificationEmail(email.trim());
        setSuccess('Revisa tu correo y confirma tu cuenta antes de iniciar sesión. Si ya tenías una cuenta, inicia sesión o recupera tu contraseña.');
      } else {
        resetState();
        onClose();
      }
    }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud.');
    } finally {
    setLoading(false);
    }
  };

  const handleVerifyMFA = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMfaError(null);
    if (mfaCode.length !== 6) {
      setMfaError('Ingresa los 6 dígitos de tu aplicación autenticadora.');
      return;
    }
    setMfaVerifying(true);
    const { error } = await verifyMFA(mfaCode);
    setMfaVerifying(false);
    if (error) {
      setMfaError(error);
      setMfaCode('');
      return;
    }
    resetState();
    onClose();
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setPassword('');
    setResetRequested(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div className="modal auth-modal" role="dialog" aria-modal="true" aria-label="Acceso a Lumen" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Cerrar">
          <X size={19} />
        </button>

        {success ? (
          <div className="auth-form">
            <div className="modal-symbol"><Mail size={28} /></div>
            <h2>Solicitud completada</h2>
            <p className="modal-description" role="status">{success}</p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {verificationEmail && <button className="secondary-button full" onClick={() => void resendConfirmation()} disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : 'Reenviar enlace de confirmación'}
            </button>}
            <button className="primary-button full" onClick={() => { resetState(); onClose(); }}>Entendido</button>
          </div>
        ) : mfaPending ? (
          <form onSubmit={handleVerifyMFA} className="auth-form">
            <div className="modal-symbol"><ShieldCheck size={28} /></div>
            <p className="eyebrow">VERIFICACIÓN EN DOS PASOS</p>
            <h2>Ingresa tu código</h2>
            <p className="modal-description">
              Abre tu aplicación autenticadora (Google Authenticator, Authy, etc.) e ingresa el código de 6 dígitos.
            </p>
            <CodeInput value={mfaCode} onChange={setMfaCode} disabled={mfaVerifying} />
            {mfaError && <p className="auth-error">{mfaError}</p>}
            <button type="submit" className="primary-button full" disabled={mfaVerifying}>
              {mfaVerifying ? <Loader2 size={17} className="spin" /> : <>Verificar <ArrowRight size={17} /></>}
            </button>
            <button type="button" className="text-link center" onClick={handleClose}>
              Cancelar
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="modal-symbol"><KeyRound size={28} /></div>
            <p className="eyebrow">{passwordRecovery || resetRequested ? 'RECUPERA TU ACCESO' : mode === 'login' ? 'BIENVENIDO DE VUELTA' : 'CREA TU CUENTA'}</p>
            <h2>{passwordRecovery ? 'Elige una nueva contraseña' : resetRequested ? 'Restablecer contraseña' : mode === 'login' ? 'Inicia sesión en Lumen' : 'Únete a Lumen'}</h2>
            <p className="modal-description">
              {passwordRecovery ? 'Guarda una contraseña de al menos 8 caracteres.' : resetRequested ? 'Te enviaremos un enlace a tu correo.' : mode === 'login'
                ? 'Accede a tu espacio personal y continúa leyendo.'
                : 'Crea tu cuenta y empieza a explorar la biblioteca.'}
            </p>

            {mode === 'signup' && !resetRequested && !passwordRecovery && (
              <>
              <label>
                Nombre completo
                <div className="input-wrap">
                  <User size={16} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre"
                    maxLength={100}
                    autoComplete="name"
                    required
                  />
                </div>
              </label>
              <label>
                Nombre de usuario
                <div className="input-wrap">
                  <User size={16} />
                  <input value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="El nombre que quieras" required
                    autoComplete="username" autoCapitalize="none" spellCheck={false} />
                </div>
                <small>Elige el nombre que quieras. Debe estar disponible.</small>
              </label>
              </>
            )}

            {!passwordRecovery && <label>
              Correo electrónico
              <div className="input-wrap">
                <Mail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoComplete="email"
                />
              </div>
            </label>}

            {!resetRequested && <label>
              Contraseña
              <div className="input-wrap">
                <KeyRound size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                  required
                  minLength={mode === 'signup' || passwordRecovery ? 8 : undefined}
                  autoComplete={mode === 'login' && !passwordRecovery ? 'current-password' : 'new-password'}
                />
                <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>}

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="primary-button full" disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : <>
                {passwordRecovery ? 'Guardar contraseña' : resetRequested ? 'Enviar enlace' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} <ArrowRight size={17} />
              </>}
            </button>

            {!passwordRecovery && <button type="button" className="text-link center" onClick={switchMode} disabled={loading}>
              {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>}
            {mode === 'login' && !passwordRecovery && <button type="button" className="text-link center" disabled={loading}
              onClick={() => { setResetRequested(!resetRequested); setError(null); setPassword(''); }}>
              {resetRequested ? 'Volver al inicio de sesión' : 'Olvidé mi contraseña'}
            </button>}
          </form>
        )}
      </div>
    </div>
  );
}
