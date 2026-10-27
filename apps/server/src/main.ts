import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = app.get(ConfigService<Env, true>).get('SERVER_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`Servidor rodando em http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
