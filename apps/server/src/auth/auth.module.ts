import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        // Algoritmo fixo nos dois lados: evita ataques de troca de algoritmo.
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, AuthGuard],
  // O AuthGuard é registrado como guard global no AppModule (ver a ordem lá);
  // o JwtModule é exportado para o gateway de tempo real validar tokens.
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
