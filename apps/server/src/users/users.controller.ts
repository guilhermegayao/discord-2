import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import type { UserDto } from '@discord-2/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { toUserDto, UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() auth: AuthUser): Promise<UserDto> {
    const user = await this.users.findById(auth.id);
    // Token válido de um usuário que foi apagado depois
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return toUserDto(user);
  }
}
