import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Env } from './config/env.js';
import { LIVEKIT_WEBHOOK_PATH } from './voice/voice.controller.js';

/**
 * Configuração compartilhada entre main.ts e os testes, para que os
 * testes sobem o app exatamente como em produção.
 */
export function configureApp(
  app: INestApplication,
  options: { trustProxy?: boolean } = {},
): INestApplication {
  // Mesmo prefixo em dev e produção: o cookie do refresh token usa path=/api/auth.
  app.setGlobalPrefix('api');
  const trustProxy =
    options.trustProxy ?? app.get(ConfigService<Env, true>).get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    // Confia só no primeiro salto (o Caddy na frente); um cliente não consegue
    // forjar o próprio IP mandando X-Forwarded-For, porque o Caddy reescreve.
    (app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', 1);
  }
  app.use(cookieParser());
  // O webhook do LiveKit chega como application/webhook+json, e a assinatura
  // vale para os bytes exatos: guardamos o corpo cru, sem interpretar o JSON.
  app.use(LIVEKIT_WEBHOOK_PATH, express.raw({ type: 'application/webhook+json', limit: '1mb' }));
  app.enableShutdownHooks();
  return app;
}
