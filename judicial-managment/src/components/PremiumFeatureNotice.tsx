import { Crown, LockKeyhole } from 'lucide-react';

interface PremiumFeatureNoticeProps {
  title: string;
  description: string;
  onUpgrade: () => void;
}

export default function PremiumFeatureNotice({ title, description, onUpgrade }: PremiumFeatureNoticeProps) {
  return (
    <section className="flex min-h-[360px] items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl border-y border-slate-200 py-10 text-center dark:border-slate-700">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Función Premium</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        <button type="button" onClick={onUpgrade} className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800">
          <Crown className="h-4 w-4" />
          Activar Premium
        </button>
      </div>
    </section>
  );
}
