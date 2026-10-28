import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CreateInviteData,
  createInviteSchema,
  type DmChannelDto,
  type GuildWithChannelsDto,
  type InviteDto,
  type InvitePreviewDto,
  type MemberDto,
  type OpenDmData,
  openDmSchema,
} from '@discord-2/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DmsService } from './dms.service.js';
import { InvitesService } from './invites.service.js';
import { MembersService } from './members.service.js';

/** Códigos de convite são curtos e só têm letras, números, "-" e "_". */
const InviteCodePipe = new ZodValidationPipe(z.string().regex(/^[\w-]{6,32}$/));

/** Dificulta "chutar" códigos de convite. */
const INVITE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('guilds/:guildId/invites')
  create(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteData,
  ): Promise<InviteDto> {
    return this.invites.create(guildId, user.id, body);
  }

  @Get('guilds/:guildId/invites')
  list(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
  ): Promise<InviteDto[]> {
    return this.invites.list(guildId, user.id);
  }

  @Get('invites/:code')
  @Throttle(INVITE_THROTTLE)
  preview(
    @CurrentUser() user: AuthUser,
    @Param('code', InviteCodePipe) code: string,
  ): Promise<InvitePreviewDto> {
    return this.invites.preview(code, user.id);
  }

  @Post('invites/:code')
  @HttpCode(HttpStatus.OK)
  @Throttle(INVITE_THROTTLE)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('code', InviteCodePipe) code: string,
  ): Promise<GuildWithChannelsDto> {
    return this.invites.accept(code, user.id);
  }

  @Delete('invites/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('code', InviteCodePipe) code: string,
  ): Promise<void> {
    return this.invites.revoke(code, user.id);
  }
}

@Controller('guilds/:guildId')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  list(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
  ): Promise<MemberDto[]> {
    return this.members.list(guildId, user.id);
  }

  @Post('leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUser() user: AuthUser, @Param('guildId', UuidPipe) guildId: string) {
    return this.members.leave(guildId, user.id);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  kick(
    @CurrentUser() user: AuthUser,
    @Param('guildId', UuidPipe) guildId: string,
    @Param('userId', UuidPipe) targetId: string,
  ): Promise<void> {
    return this.members.kick(guildId, user.id, targetId);
  }
}

@Controller('dms')
export class DmsController {
  constructor(private readonly dms: DmsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<DmChannelDto[]> {
    return this.dms.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  open(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(openDmSchema)) body: OpenDmData,
  ): Promise<DmChannelDto> {
    return this.dms.open(user.id, body.userId);
  }
}
