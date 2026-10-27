import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Configuração compartilhada entre main.ts e os testes, para que os
 * testes sobem o app exatamente como em produção.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Mesmo prefixo em dev e produção: o cookie do refresh token usa path=/api/auth.
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
  return app;
}
