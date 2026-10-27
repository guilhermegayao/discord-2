import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O esbuild (padrão do Vitest) não emite metadados de decorators,
  // e a injeção de dependência do Nest depende deles. O SWC emite.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://discord2:discord2_dev@localhost:5433/discord2?schema=public',
    },
  },
});
