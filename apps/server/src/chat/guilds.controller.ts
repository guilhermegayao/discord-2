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
} from '@nestjs/common';
import {
  type ChannelDto,
  type CreateChannelData,
  createChannelSchema,
  type CreateGuildData,
  createGuildSchema,
  type GuildDto,
  type GuildWithChannelsDto,
  type UpdateGuildData,
  updateGuildSchema,
} from '@discord-2/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ChannelsService } from './channels.service.js';
import { GuildsService } from './guilds.service.js';

@Controller('guilds')
export class GuildsController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly channels: ChannelsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<GuildDto[]> {
    return this.guilds.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGuildSchema)) body: CreateGuildData,
  ): Promise<GuildWithChannelsDto> {
    return this.guilds.create(user.id, body);
  }

  @Get(':guildId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
  ): Promise<GuildWithChannelsDto> {
    return this.guilds.get(guildId, user.id);
  }

  @Patch(':guildId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
    @Body(new ZodValidationPipe(updateGuildSchema)) body: UpdateGuildData,
  ): Promise<GuildDto> {
    return this.guilds.update(guildId, user.id, body);
  }

  @Delete(':guildId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
  ): Promise<void> {
    return this.guilds.remove(guildId, user.id);
  }

  @Post(':guildId/channels')
  createChannel(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelData,
  ): Promise<ChannelDto> {
    return this.channels.create(guildId, user.id, body);
  }
}
