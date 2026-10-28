import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { VoiceModule } from '../voice/voice.module.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { DmsService } from './dms.service.js';
import { GuildsController } from './guilds.controller.js';
import { GuildsService } from './guilds.service.js';
import { InvitesService } from './invites.service.js';
import { MembersService } from './members.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { DmsController, InvitesController, MembersController } from './social.controllers.js';

@Module({
  imports: [AccessModule, RealtimeModule, VoiceModule],
  controllers: [
    GuildsController,
    ChannelsController,
    MessagesController,
    InvitesController,
    MembersController,
    DmsController,
  ],
  providers: [
    GuildsService,
    ChannelsService,
    MessagesService,
    InvitesService,
    MembersService,
    DmsService,
  ],
})
export class ChatModule {}
