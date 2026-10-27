import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const devUrl =
  process.env.DATABASE_URL ??
  'postgresql://discord2:discord2_dev@localhost:5433/discord2?schema=public';

// Os testes usam um banco separado (<nome>_test), nunca o de desenvolvimento.
const testUrl = new URL(devUrl);
testUrl.pathname = `${testUrl.pathname}_test`;

const dbTests = process.env.DB_TESTS === '1';

export default defineConfig({
  // O esbuild (padrão do Vitest) não emite metadados de decorators,
  // e a injeção de dependência do Nest depende deles. O SWC emite.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Os testes de banco limpam as tabelas; em paralelo, um apagaria os dados do outro.
    fileParallelism: false,
    globalSetup: dbTests ? ['./test/global-setup.ts'] : [],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl.toString(),
      JWT_ACCESS_SECRET: 'segredo-de-teste-com-pelo-menos-32-caracteres',
    },
  },
});
