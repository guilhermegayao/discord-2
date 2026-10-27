import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O .env fica na raiz do monorepo. No CI as variáveis vêm do ambiente.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` (roda no npm install) não precisa da URL; só migrate/studio.
  // Por isso não usamos env(), que quebraria a instalação antes de existir um .env.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
