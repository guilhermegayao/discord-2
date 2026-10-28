import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { VoiceChannelStateDto, VoiceTokenDto } from '@discord-2/shared';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Public } from '../auth/decorators.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { VoiceService } from './voice.service.js';

export const LIVEKIT_WEBHOOK_PATH = '/api/livekit/webhook';

@Controller()
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('channels/:channelId/voice-token')
  @HttpCode(HttpStatus.OK)
  token(
    @CurrentUser() user: AuthUser,
    @Param('channelId', UuidPipe) channelId: string,
  ): Promise<VoiceTokenDto> {
    return this.voice.createToken(channelId, user.id);
  }

  @Get('guilds/:guildId/voice-states')
  states(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
  ): Promise<VoiceChannelStateDto[]> {
    return this.voice.statesForGuild(guildId, user.id);
  }

  /**
   * Chamado pelo LiveKit (não pelo navegador). Público para o AuthGuard,
   * mas protegido pela assinatura do webhook. O corpo chega cru (Buffer),
   * porque a assinatura é sobre os bytes exatos que o LiveKit enviou.
   */
  @Public()
  @SkipThrottle()
  @Post('livekit/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<void> {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    await this.voice.handleWebhook(body, authorization);
  }
}
