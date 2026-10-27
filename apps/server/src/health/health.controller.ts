import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@discord-2/shared';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 200 quando tudo está ok; 503 quando o banco está fora.
   * O corpo vem sempre no mesmo formato, para o cliente saber o que falhou.
   */
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
