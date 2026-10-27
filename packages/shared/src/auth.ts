import { z } from 'zod';

/**
 * Regras de cadastro e login. Usadas pelo servidor (validação do corpo)
 * e pelo web (validação do formulário), então as mensagens ficam iguais.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'E-mail inválido' }));

export const passwordSchema = z
  .string()
  .min(8, { error: 'A senha precisa ter pelo menos 8 caracteres' })
  .max(128, { error: 'A senha pode ter no máximo 128 caracteres' });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: 'O usuário precisa ter pelo menos 3 caracteres' })
  .max(32, { error: 'O usuário pode ter no máximo 32 caracteres' })
  .regex(/^[a-z0-9_.]+$/, { error: 'Use só letras, números, "_" e "."' });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Informe um nome de exibição' })
  .max(32, { error: 'O nome pode ter no máximo 32 caracteres' });

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // No login não revalidamos o tamanho mínimo: senhas antigas podem seguir regras antigas.
  password: z.string().min(1, { error: 'Informe a senha' }).max(128),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});
export type UserDto = z.infer<typeof userSchema>;

/** Resposta de register/login/refresh. O refresh token vai num cookie httpOnly, não aqui. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Formato padrão de erro da API. */
export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
