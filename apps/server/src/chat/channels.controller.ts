import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ChannelDto,
  type CreateMessageData,
  createMessageSchema,
  type MessageDto,
  type MessagePageDto,
  type MessagePageQuery,
  messagePageQuerySchema,
  type UpdateChannelData,
  updateChannelSchema,
} from '@discord-2/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ChannelsService } from './channels.service.js';
import { MessagesService } from './messages.service.js';

/** Anti-spam: até 5 mensagens a cada 5 segundos por usuário. */
const MESSAGE_THROTTLE = { default: { limit: 5, ttl: 5_000 } };

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
  ) {}

  @Patch(':channelId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('channelId', UuidPipe) channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelData,
  ): Promise<ChannelDto> {
    return this.channels.update(channelId, user.id, body);
  }

  @Delete(':channelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('channelId', UuidPipe) channelId: string,
  ): Promise<void> {
    return this.channels.remove(channelId, user.id);
  }

  @Get(':channelId/messages')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('channelId', UuidPipe) channelId: string,
    @Query(new ZodValidationPipe(messagePageQuerySchema)) query: MessagePageQuery,
  ): Promise<MessagePageDto> {
    return this.messages.list(channelId, user.id, query);
  }

  @Post(':channelId/messages')
  @Throttle(MESSAGE_THROTTLE)
  createMessage(
    @CurrentUser() user: AuthUser,
    @Param('channelId', UuidPipe) channelId: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageData,
  ): Promise<MessageDto> {
    return this.messages.create(channelId, user.id, body);
  }
}
