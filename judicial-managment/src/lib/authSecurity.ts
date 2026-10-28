import { supabase } from './supabase';

export const desktopAuthRedirectUrl = 'judicial-managment://auth/callback';
export const authWebUrl = import.meta.env.VITE_AUTH_WEB_URL ?? 'https://yzdemnz.github.io/judicial-managment-portal/';
export const backupRecoveryEnabled = import.meta.env.VITE_BACKUP_RECOVERY_ENABLED === 'true';

export const getAuthRedirectUrl = () => {
  if (window.judicialDesktop?.openExternalUrl) return desktopAuthRedirectUrl;
  return `${window.location.origin}/auth/callback`;
};

export const getEmailConfirmationRedirectUrl = () => {
  return `${authWebUrl.replace(/\/$/, '')}/auth/confirm`;
};

export const getPasswordRecoveryPortalUrl = () => {
  return `${authWebUrl.replace(/\/$/, '')}/recuperar`;
};

export const getBackupRecoveryPortalUrl = () => {
  return `${authWebUrl.replace(/\/$/, '')}/respaldo`;
};

export const getAccountPortalUrl = () => {
  return `${authWebUrl.replace(/\/$/, '')}/configuracion`;
};

export const needsMfaChallenge = async () => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;

  return data.nextLevel === 'aal2' && data.currentLevel !== data.nextLevel;
};

export const verifyMfaCode = async (code: string) => {
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;

  const factor = factors.data.totp.find((item) => item.status === 'verified') ?? factors.data.totp[0];
  if (!factor) {
    throw new Error('No hay un factor de verificacion en 2 pasos activo.');
  }

  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw challenge.error;

  const verify = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });

  if (verify.error) throw verify.error;
};

export const exchangeOAuthCodeFromUrl = async (url: string) => {
  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get('code');

  if (!code) return false;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;

  return true;
};
