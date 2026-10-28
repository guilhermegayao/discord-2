import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { ChatAccessService } from './chat-access.service.js';
import { GuildsController } from './guilds.controller.js';
import { GuildsService } from './guilds.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [GuildsController, ChannelsController, MessagesController],
  providers: [ChatAccessService, GuildsService, ChannelsService, MessagesService],
})
export class ChatModule {}
