import { useCallback, useEffect, useState } from 'react';
import { QrCode, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TotpFactor {
  id: string;
  friendly_name?: string | null;
  status: string;
  created_at?: string;
}

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Fecha no disponible';

interface SecuritySettingsProps {
  onMfaStateChange?: (enabled: boolean) => void;
}

export default function SecuritySettings({ onMfaStateChange }: SecuritySettingsProps) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchFactors = useCallback(async () => {
    const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setError(factorsError.message);
      return;
    }
    const nextFactors = (data.totp ?? []) as TotpFactor[];
    setFactors(nextFactors);
    onMfaStateChange?.(nextFactors.some((factor) => factor.status === 'verified'));
  }, [onMfaStateChange]);

  useEffect(() => { fetchFactors(); }, [fetchFactors]);

  const verifiedFactors = factors.filter((factor) => factor.status === 'verified');
  const hasVerifiedMfa = verifiedFactors.length > 0;

  const startEnrollment = async () => {
    setLoading(true); setMessage(''); setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Judicial Managment' });
      if (enrollError) throw enrollError;
      setFactorId(data.id); setQrCode(data.totp.qr_code); setSecret(data.totp.secret);
      setMessage('Escanea el QR con tu app autenticadora y confirma el codigo.');
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : 'No se pudo iniciar la verificacion en 2 pasos.');
    } finally { setLoading(false); }
  };

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setMessage(''); setError('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: verifyCode });
      if (verify.error) throw verify.error;
      setFactorId(''); setQrCode(''); setSecret(''); setVerifyCode('');
      setMessage('Verificacion en 2 pasos activada correctamente.');
      await fetchFactors();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Codigo de verificacion invalido.');
    } finally { setLoading(false); }
  };

  const cancelEnrollment = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
    setFactorId(''); setQrCode(''); setSecret(''); setVerifyCode(''); setMessage(''); setError('');
    await fetchFactors();
  };

  const removeFactor = async (id: string) => {
    setLoading(true); setMessage(''); setError('');
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (unenrollError) setError(unenrollError.message);
    else { setMessage('Verificacion en 2 pasos eliminada.'); await fetchFactors(); }
    setLoading(false);
  };

  return (
    <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <ShieldCheck className="h-5 w-5 text-blue-700 dark:text-blue-300" />
        <div><h3 className="font-semibold text-slate-950 dark:text-white">Verificacion en 2 pasos</h3><p className="text-xs text-slate-500 dark:text-slate-400">Un segundo codigo para proteger el acceso a tu cuenta.</p></div>
      </div>
      <div className="p-5">
        {message && <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-100">{message}</div>}
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100">{error}</div>}
        {hasVerifiedMfa ? <div className="space-y-3"><div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100">La verificacion en 2 pasos esta activa.</div>{verifiedFactors.map((factor) => <div key={factor.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3 dark:border-slate-700"><div className="grid h-9 w-9 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-medium text-slate-950 dark:text-white">{factor.friendly_name || 'App autenticadora'}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(factor.created_at)}</p></div><button type="button" onClick={() => removeFactor(factor.id)} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-200"><Trash2 className="h-4 w-4" />Quitar</button></div>)}</div> : qrCode ? <form onSubmit={verifyEnrollment} className="grid gap-5 lg:grid-cols-[220px_1fr]"><div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40"><img src={qrCode} alt="Codigo QR para 2FA" className="w-full rounded-md bg-white" /></div><div className="space-y-4"><div><div className="flex items-center gap-2 text-slate-950 dark:text-white"><QrCode className="h-5 w-5 text-blue-700 dark:text-blue-300" /><h4 className="font-semibold">Escanea y confirma</h4></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Si no puedes escanear, escribe esta clave en tu autenticador:</p><code className="mt-2 block break-all rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">{secret}</code></div><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Codigo de 6 digitos<input type="text" inputMode="numeric" maxLength={6} required value={verifyCode} onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, ''))} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="000000" /></label><div className="flex gap-2"><button type="button" onClick={() => cancelEnrollment().catch(() => undefined)} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Cancelar</button><button type="submit" disabled={loading || verifyCode.length < 6} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">Activar 2FA</button></div></div></form> : <div className="flex flex-col gap-3 rounded-md border border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-700"><div><h4 className="font-semibold text-slate-950 dark:text-white">Activar verificacion en 2 pasos</h4><p className="text-sm text-slate-600 dark:text-slate-300">Usa Google Authenticator, Microsoft Authenticator, Authy o una app compatible.</p></div><button type="button" onClick={() => startEnrollment().catch(() => undefined)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Configurar 2FA</button></div>}
      </div>
    </section>
  );
}
