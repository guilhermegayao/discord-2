import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // npm run dev roda dentro de apps/server; o .env fica na raiz do monorepo
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    // Limite geral; rotas sensíveis têm limites próprios com @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RealtimeModule,
    ChatModule,
  ],
  providers: [
    // Guards globais rodam na ordem em que são registrados aqui:
    // primeiro identifica o usuário, depois aplica o rate limit por usuário.
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
