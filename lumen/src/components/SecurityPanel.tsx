import { useEffect, useState, FormEvent } from 'react';
import { AuthMFAEnrollResponse } from '@supabase/supabase-js';

type MFAEnrollData = Extract<NonNullable<AuthMFAEnrollResponse['data']>, { type: 'totp' }>;
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Lock,
  LogOut,

  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { CodeInput } from '@/components/CodeInput';
import { normalizeUsername, usernameError } from '@/lib/usernames';

type SecurityPanelProps = {
  open: boolean;
  onClose: () => void;
};

type MFAStatus = 'checking' | 'none' | 'active' | 'error';

export function SecurityPanel({ open, onClose }: SecurityPanelProps) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>('checking');
  const [enrollData, setEnrollData] = useState<MFAEnrollData | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setUsername(profile.username);
    }
  }, [profile]);

  const checkMFA = async () => {
    setMfaStatus('checking');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaStatus('error');
      setVerifyError('No se pudo consultar la protección de la cuenta. Vuelve a abrir este panel.');
      return;
    }
    const hasVerified = data?.totp?.some((f) => f.status === 'verified');
    setMfaStatus(hasVerified ? 'active' : 'none');
  };

  useEffect(() => {
    if (open) checkMFA();
  }, [open]);

  if (!open) return null;

  const startEnroll = async () => {
    setEnrolling(true);
    setVerifyError(null);
    setVerifyCode('');
    // Recover an enrollment abandoned by navigation or a closed browser.
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setVerifyError(factorsError.message);
      setEnrolling(false);
      return;
    }
    for (const factor of factors.all.filter((item) => item.factor_type === 'totp' && item.status === 'unverified')) {
      const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (cleanupError) {
        setVerifyError(cleanupError.message);
        setEnrolling(false);
        return;
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'LUMEN', friendlyName: 'LUMEN Biblioteca' });
    if (error) {
      setVerifyError(error.message);
      setEnrolling(false);
      return;
    }
    setEnrollData(data);
    setEnrolling(false);
  };

  const cancelEnroll = async () => {
    if (enrollData) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: enrollData.id });
      if (error) {
        setVerifyError(error.message);
        return false;
      }
    }
    setEnrollData(null);
    setVerifyCode('');
    setVerifyError(null);
    return true;
  };

  const handleClose = async () => {
    if (enrolling || verifying || unenrolling || savingName) return;
    if (await cancelEnroll()) {
      setAccountError(null);
      onClose();
    }
  };

  const confirmEnroll = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setVerifyError(null);
    if (verifyCode.length !== 6) {
      setVerifyError('Ingresa los 6 dígitos de tu aplicación autenticadora.');
      return;
    }
    if (!enrollData) return;
    setVerifying(true);
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollData.id,
    });
    if (challengeError) {
      setVerifyError(challengeError.message);
      setVerifying(false);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollData.id,
      challengeId: challengeData.id,
      code: verifyCode.trim(),
    });
    setVerifying(false);
    if (verifyErr) {
      setVerifyError(verifyErr.message);
      setVerifyCode('');
      return;
    }
    setEnrollData(null);
    setVerifyCode('');
    setMfaStatus('active');
  };

  const unenrollMFA = async () => {
    setVerifyError(null);
    const { data, error: lookupError } = await supabase.auth.mfa.listFactors();
    if (lookupError) { setVerifyError(lookupError.message); return; }
    const factor = data?.totp?.find((f) => f.status === 'verified');
    if (!factor) return;
    setUnenrolling(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setUnenrolling(false);
    if (error) { setVerifyError(error.message); return; }
    setMfaStatus('none');
  };

  const copySecret = async () => {
    if (enrollData?.totp.secret) {
      try {
        await navigator.clipboard.writeText(enrollData.totp.secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { setVerifyError('No se pudo copiar. Selecciona la clave y cópiala manualmente.'); }
    }
  };

  const saveName = async () => {
    if (!user) return;
    setAccountError(null);
    const invalid = usernameError(username);
    if (invalid) { setAccountError(invalid); return; }
    setSavingName(true);
    try {
      const normalized = normalizeUsername(username);
      if (normalized !== profile?.username) {
        const { data: available, error: checkError } = await supabase.rpc('is_username_available', { p_username: normalized });
        if (checkError) throw new Error('No se pudo comprobar el nombre de usuario.');
        if (!available) throw new Error('Ese nombre de usuario ya está ocupado.');
      }
      const { data, error } = await supabase.from('profiles').update({ full_name: fullName.trim(), username: normalized }).eq('id', user.id).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Ese nombre de usuario ya está ocupado.' : 'No se pudieron guardar los cambios.');
      if (!data) throw new Error('No se pudieron guardar los cambios.');
      await refreshProfile();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.');
    } finally { setSavingName(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div className="modal security-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Cerrar">
          <X size={19} />
        </button>

        <div className="modal-symbol"><Lock size={28} /></div>
        <p className="eyebrow">SEGURIDAD Y PRIVACIDAD</p>
        <h2>Centro de seguridad</h2>
        <p className="modal-description">Gestiona tu cuenta, la verificación en dos pasos y la protección de tus datos.</p>

        <div className="security-section">
          <div className="security-section-head">
            <User size={18} />
            <strong>Datos de la cuenta</strong>
          </div>
          <div className="security-field">
            <label>Correo electrónico</label>
            <div className="security-value">{user?.email}</div>
          </div>
          <div className="security-field">
            <label htmlFor="account-username">Nombre de usuario</label>
            <div className="security-inline">
              <input id="account-username" value={username} onChange={(event) => setUsername(event.target.value)}
                required autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
          <div className="security-field">
            <label>Nombre visible</label>
            <div className="security-inline">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
                maxLength={100}
              />
              <button className="secondary-button small" onClick={saveName} disabled={savingName}>
                {savingName ? <Loader2 size={14} className="spin" /> : nameSaved ? <Check size={14} /> : 'Guardar'}
              </button>
            </div>
          </div>
          {accountError && <p className="auth-error" role="alert">{accountError}</p>}
        </div>

        <div className="security-section">
          <div className="security-section-head">
            <ShieldCheck size={18} />
            <strong>Verificación en dos pasos (2FA)</strong>
            {mfaStatus === 'active' && <span className="badge active">Activo</span>}
            {mfaStatus === 'none' && <span className="badge inactive">Inactivo</span>}
          </div>

          {mfaStatus === 'checking' && (
            <div className="security-loading"><Loader2 size={20} className="spin" /></div>
          )}
          {verifyError && !enrollData && <p className="auth-error" role="alert">{verifyError}</p>}

          {mfaStatus === 'none' && !enrollData && (
            <div className="security-info">
              <p>La verificación en dos pasos añade una capa extra de seguridad. Al iniciar sesión, se te pedirá un código de tu aplicación autenticadora además de tu contraseña.</p>
              <button className="primary-button" onClick={startEnroll} disabled={enrolling}>
                {enrolling ? <Loader2 size={16} className="spin" /> : <>Configurar 2FA <ArrowRight size={16} /></>}
              </button>
            </div>
          )}

          {enrollData && (
            <div className="mfa-setup">
              <div className="mfa-step">
                <span className="step-num">1</span>
                <p>Escanea este código QR con tu aplicación autenticadora (Google Authenticator, Authy, 1Password, etc.).</p>
                <div className="qr-container">
                  <img src={enrollData.totp.qr_code} alt="Código QR para 2FA" />
                </div>
              </div>
              <div className="mfa-step">
                <span className="step-num">2</span>
                <p>Si no puedes escanear, copia esta clave e introdúcela manualmente en tu app:</p>
                <div className="secret-row">
                  <code>{enrollData.totp.secret}</code>
                  <button className="copy-btn" onClick={copySecret}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
              <div className="mfa-step">
                <span className="step-num">3</span>
                <p>Ingresa el código de 6 dígitos que aparece en tu aplicación:</p>
                <form onSubmit={confirmEnroll}>
                  <CodeInput value={verifyCode} onChange={setVerifyCode} disabled={verifying} />
                  {verifyError && <p className="auth-error">{verifyError}</p>}
                  <div className="mfa-actions">
                    <button type="button" className="text-link" onClick={cancelEnroll}>Cancelar</button>
                    <button type="submit" className="primary-button" disabled={verifying}>
                      {verifying ? <Loader2 size={16} className="spin" /> : <>Verificar y activar <Check size={16} /></>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {mfaStatus === 'active' && (
            <div className="security-info">
              <div className="security-confirmed">
                <Check size={18} />
                <p>Tu cuenta está protegida con verificación en dos pasos. Cada vez que inicies sesión necesitarás tu aplicación autenticadora.</p>
              </div>
              <button className="danger-button" onClick={unenrollMFA} disabled={unenrolling}>
                {unenrolling ? <Loader2 size={16} className="spin" /> : <><Trash2 size={15} /> Desactivar 2FA</>}
              </button>
            </div>
          )}
        </div>

        <div className="security-section">
          <div className="security-section-head">
            <Lock size={18} />
            <strong>Protección de datos</strong>
          </div>
          <div className="security-protection-list">
            <div className="protection-item">
              <ShieldCheck size={16} />
              <span>Contraseñas cifradas y gestionadas por Supabase Auth (nunca se almacenan en texto plano).</span>
            </div>
            <div className="protection-item">
              <Smartphone size={16} />
              <span>El secreto 2FA se genera y almacena de forma segura; no lo compartas con nadie.</span>
            </div>
            <div className="protection-item">
              <AlertTriangle size={16} />
              <span>Tus datos personales solo son visibles para ti (políticas RLS a nivel base de datos).</span>
            </div>
          </div>
        </div>

        <button className="danger-button full" disabled={enrolling || verifying || unenrolling || savingName} onClick={async () => {
          try { if (await cancelEnroll()) { await signOut(); onClose(); } }
          catch { setAccountError('No se pudo cerrar la sesión. Inténtalo de nuevo.'); }
        }}>
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
