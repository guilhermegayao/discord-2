import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { liveKitProvider } from './livekit.provider.js';
import { VoiceRegistry } from './voice-registry.js';
import { VoiceController } from './voice.controller.js';
import { VoiceService } from './voice.service.js';

@Module({
  imports: [AccessModule, RealtimeModule],
  controllers: [VoiceController],
  providers: [liveKitProvider, VoiceRegistry, VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
