import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@discord-2/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const DB_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const db = await this.pingDatabase();
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db,
    };
  }

  private async pingDatabase(): Promise<HealthResponse['db']> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
