import appIconUrl from '../../assets/icons/icon.png';

interface JurisStartupProps {
  exiting: boolean;
  progress: number;
  status: string;
  detail: string;
}

export default function JurisStartup({
  exiting,
  progress,
  status,
  detail,
}: JurisStartupProps) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <main
      className={`juris-startup-screen ${exiting ? 'is-exiting' : ''}`}
      aria-live="polite"
      aria-label="Iniciando Judicial Managment"
    >
      <div className="juris-startup-grid" />
      <div className="juris-startup-glow juris-startup-glow-primary" />
      <div className="juris-startup-glow juris-startup-glow-accent" />

      <div className="juris-startup-content">
        <div className="juris-startup-logo">
          <img src={appIconUrl} alt="" />
        </div>

        <div className="juris-startup-copy">
          <p className="juris-startup-eyebrow">Preparando tu despacho</p>
          <h1>Judicial Managment</h1>
          <p>{status}</p>
        </div>

        <div
          className="juris-startup-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
        >
          <div className="juris-startup-progress-track">
            <span style={{ width: `${safeProgress}%` }} />
          </div>
          <div className="juris-startup-progress-meta">
            <span>{detail}</span>
            <strong>{safeProgress}%</strong>
          </div>
        </div>
      </div>
    </main>
  );
}
