import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/**
 * Valida ids na URL antes de chegar ao banco (um id malformado numa coluna
 * uuid do Postgres viraria erro 500). O z.uuid() aceita UUID v7.
 */
export const UuidPipe = new ZodValidationPipe(z.uuid());
