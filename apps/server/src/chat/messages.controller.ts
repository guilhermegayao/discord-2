import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { type MessageDto, type UpdateMessageData, updateMessageSchema } from '@discord-2/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MessagesService } from './messages.service.js';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Patch(':messageId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('messageId', UuidPipe) messageId: string,
    @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageData,
  ): Promise<MessageDto> {
    return this.messages.update(messageId, user.id, body);
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('messageId', UuidPipe) messageId: string,
  ): Promise<void> {
    return this.messages.remove(messageId, user.id);
  }
}
