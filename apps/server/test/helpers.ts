import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

export function http(app: INestApplication) {
  return request(app.getHttpServer() as Server);
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  await app.get(PrismaService).$executeRawUnsafe('TRUNCATE TABLE "sessions", "users" CASCADE');
}

export const newUser = {
  email: 'gui@example.com',
  username: 'gui',
  displayName: 'Guilherme',
  password: 'senha-forte-123',
};

/** Extrai o valor do cookie de refresh do header Set-Cookie. */
export function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('d2_refresh='));
  const value = cookie?.split(';')[0]?.slice('d2_refresh='.length);
  return value ? `d2_refresh=${value}` : undefined;
}
