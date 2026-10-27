import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ApiError } from '@discord-2/shared';
import { z } from 'zod';

/**
 * Valida (e normaliza) o corpo da requisição com um schema do shared.
 * Uso: @Body(new ZodValidationPipe(registerSchema)) body: RegisterData
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const body: ApiError = {
        statusCode: 400,
        message: 'Dados inválidos',
        fieldErrors: z.flattenError(result.error).fieldErrors as Record<string, string[]>,
      };
      throw new BadRequestException(body);
    }
    return result.data;
  }
}
