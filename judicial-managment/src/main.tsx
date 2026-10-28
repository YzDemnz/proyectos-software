import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './web/WebEntry.tsx';
import './index.css';
import './web/identity.css';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Error desconocido de interfaz.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    window.judicialDesktop?.reportRendererError?.({
      source: 'react-error-boundary',
      message: error.message,
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim(),
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
        <section className="mx-auto max-w-lg rounded-lg border border-red-400/40 bg-slate-900 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase text-red-300">Recuperacion de Judicial</p>
          <h1 className="mt-2 text-2xl font-bold">La interfaz necesita reiniciarse</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Tus expedientes no fueron eliminados. Judicial detuvo esta pantalla para evitar que un
            error temporal deje la aplicacion completamente en blanco.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500"
          >
            Reiniciar interfaz
          </button>
          <details className="mt-4 text-xs text-slate-400">
            <summary className="cursor-pointer">Detalle tecnico</summary>
            <p className="mt-2 break-words">{this.state.message}</p>
          </details>
        </section>
      </main>
    );
  }
}

window.addEventListener('error', (event) => {
  window.judicialDesktop?.reportRendererError?.({
    source: 'window-error',
    message: event.message || 'Error no controlado en la ventana.',
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  window.judicialDesktop?.reportRendererError?.({
    source: 'unhandled-rejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
