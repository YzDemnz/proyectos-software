import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, MailCheck, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { backupRecoveryEnabled, getAccountPortalUrl, getBackupRecoveryPortalUrl, getPasswordRecoveryPortalUrl } from '../lib/authSecurity';

interface AccountSettingsProps {
  mfaRevision: number;
}

const isMissingAccountColumn = (message?: string) => /app_profiles\.(telefono|correo_alternativo)|column .* does not exist|schema cache/i.test(message ?? '');

export default function AccountSettings({ mfaRevision }: AccountSettingsProps) {
  const [phone, setPhone] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [contactSchemaReady, setContactSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const [{ data: userData }, factorsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.mfa.listFactors(),
    ]);
    const user = userData.user;
    setPrimaryEmail(user?.email ?? '');
    setMfaEnabled(Boolean((factorsResult.data?.totp ?? []).some((factor) => factor.status === 'verified')));

    if (!user) {
      setError('Inicia sesión nuevamente para administrar tu cuenta.');
      setLoading(false);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('app_profiles')
      .select('telefono')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      if (isMissingAccountColumn(profileError.message)) {
        setContactSchemaReady(false);
        setPhone('');
      } else {
        setError(profileError.message);
      }
    } else {
      setContactSchemaReady(true);
      setPhone((data as { telefono?: string | null } | null)?.telefono ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load, mfaRevision]);

  const savePhone = async () => {
    if (!contactSchemaReady) return;
    setSavingPhone(true);
    setMessage('');
    setError('');
    const { error: updateError } = await supabase.rpc('update_my_account_phone', {
      telefono_value: phone.trim() || null,
    });
    setSavingPhone(false);

    if (updateError) {
      setError(updateError.code === 'PGRST202' || updateError.code === 'PGRST205'
        ? 'La actualización de cuenta estará disponible al aplicar la migración de seguridad 3.2.1.'
        : updateError.message);
      return;
    }
    setMessage('Teléfono de contacto actualizado.');
  };

  const openPortal = async (url: string) => {
    if (window.judicialDesktop?.openExternalUrl) {
      const opened = await window.judicialDesktop.openExternalUrl(url);
      if (!opened) setError('No se pudo abrir el portal seguro en el navegador.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"><ShieldCheck className="h-5 w-5" /></div>
        <div><h3 className="font-semibold text-slate-950 dark:text-white">Cuenta y recuperación</h3><p className="text-xs text-slate-500 dark:text-slate-400">Las credenciales se confirman siempre desde el portal seguro.</p></div>
      </div>
      <div className="space-y-5 p-5">
        {message && <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-100">{message}</div>}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100">{error}</div>}
        {!contactSchemaReady && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">Los datos de contacto se activarán al actualizar la base de datos. La seguridad de la cuenta sigue disponible.</div>}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-blue-700 dark:text-blue-300" /><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Teléfono de contacto</h4></div>
            <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Teléfono<input value={phone} disabled={loading || savingPhone || !contactSchemaReady} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="871 000 0000" className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800" /></label>
            <button type="button" disabled={loading || savingPhone || !contactSchemaReady} onClick={() => savePhone().catch(() => undefined)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{savingPhone && <Loader2 className="h-4 w-4 animate-spin" />}{savingPhone ? 'Guardando...' : 'Guardar teléfono'}</button>
          </div>

          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2"><MailCheck className="h-4 w-4 text-blue-700 dark:text-blue-300" /><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Correo principal</h4></div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{primaryEmail || 'Cargando correo...'}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">El cambio de correo requiere confirmación desde el portal.</p>
            <button type="button" onClick={() => openPortal(getAccountPortalUrl()).catch(() => undefined)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-200"><ExternalLink className="h-4 w-4" />Administrar correo</button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-300" /><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Restablecer contraseña</h4></div>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Escribe tu correo en el portal. Recibirás un enlace de un solo uso; la nueva contraseña solo se captura después de abrirlo.</p>
            <button type="button" onClick={() => openPortal(getPasswordRecoveryPortalUrl()).catch(() => undefined)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800"><ExternalLink className="h-4 w-4" />Continuar en el portal</button>
          </div>

          <div className={`rounded-md border p-4 ${mfaEnabled && backupRecoveryEnabled ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200 bg-slate-50 opacity-75 dark:border-slate-700 dark:bg-slate-950/40'}`}>
            <div className="flex items-center gap-2"><ShieldAlert className={`h-4 w-4 ${mfaEnabled ? 'text-emerald-600' : 'text-slate-400'}`} /><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Correo de respaldo</h4></div>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{mfaEnabled ? 'Podrás agregar un Hotmail de respaldo y confirmar que te pertenece antes de usarlo para recuperar acceso.' : 'Se habilita únicamente cuando la verificación en 2 pasos esté activa.'}</p>
            <button type="button" disabled={!mfaEnabled || !backupRecoveryEnabled} onClick={() => openPortal(getBackupRecoveryPortalUrl()).catch(() => undefined)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:text-blue-200"><ExternalLink className="h-4 w-4" />{!mfaEnabled ? 'Activa 2FA primero' : backupRecoveryEnabled ? 'Configurar respaldo' : 'Respaldo en activacion'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
