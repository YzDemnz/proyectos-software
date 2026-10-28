import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const requiredVariables = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
  const missingVariables = requiredVariables.filter((name) => {
    const value = env[name]?.trim();
    return !value || value.includes('TU-PROYECTO') || value.includes('TU_ANON_KEY');
  });

  if (missingVariables.length > 0) {
    throw new Error(
      `No se puede compilar Judicial sin configuracion: ${missingVariables.join(', ')}. `
      + 'Crea .env.local a partir de .env.example antes de compilar la web.',
    );
  }

  return {
    base: './',
    cacheDir: '.cache/vite',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
