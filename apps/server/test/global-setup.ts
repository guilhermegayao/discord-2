import { execSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * Roda uma vez antes dos testes de banco (DB_TESTS=1):
 * cria o banco de teste se não existir e aplica as migrations.
 *
 * Atenção: o globalSetup roda no processo principal do Vitest, onde o
 * `test.env` da config ainda não foi aplicado. Por isso lemos a URL da config.
 */
export default async function setup(project: TestProject): Promise<void> {
  const testUrl = new URL(project.config.env.DATABASE_URL ?? '');
  const testDb = testUrl.pathname.slice(1);
  if (!testDb.endsWith('_test')) {
    throw new Error(`Recusando rodar testes num banco que não termina com _test: ${testDb}`);
  }

  // Conecta no banco "postgres" (sempre existe) para poder criar o de teste.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      testDb,
    ]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
  });
}
