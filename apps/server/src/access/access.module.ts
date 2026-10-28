import { Module } from '@nestjs/common';
import { ChatAccessService } from './chat-access.service.js';

/**
 * Regras de acesso compartilhadas entre a API (ChatModule) e o tempo real
 * (RealtimeModule). Ficam num módulo próprio para os dois poderem usá-las
 * sem depender um do outro em círculo.
 */
@Module({
  providers: [ChatAccessService],
  exports: [ChatAccessService],
})
export class AccessModule {}
