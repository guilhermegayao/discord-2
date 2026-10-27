/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// O .env é único, na raiz do monorepo.
const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const serverUrl = `http://localhost:${env.SERVER_PORT ?? '3100'}`;

  return {
    envDir,
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? 5174),
      strictPort: true,
      // Em dev o navegador só fala com o Vite (mesma origem), e o Vite
      // repassa /api/* para o servidor. Assim não precisamos de CORS.
      proxy: {
        '/api': {
          target: serverUrl,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
