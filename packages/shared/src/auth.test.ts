import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.js';

const valid = {
  email: 'Gui@Example.com ',
  username: 'Gui_123',
  displayName: '  Guilherme ',
  password: 'senha-forte-123',
};

describe('registerSchema', () => {
  it('normaliza e-mail e username para minúsculas e tira espaços', () => {
    const data = registerSchema.parse(valid);

    expect(data).toEqual({
      email: 'gui@example.com',
      username: 'gui_123',
      displayName: 'Guilherme',
      password: 'senha-forte-123',
    });
  });

  it.each([
    ['email', 'nao-e-email', 'E-mail inválido'],
    ['username', 'ab', 'O usuário precisa ter pelo menos 3 caracteres'],
    ['username', 'com espaço', 'Use só letras, números, "_" e "."'],
    ['password', '1234567', 'A senha precisa ter pelo menos 8 caracteres'],
    ['password', 'x'.repeat(129), 'A senha pode ter no máximo 128 caracteres'],
    ['displayName', '   ', 'Informe um nome de exibição'],
  ])('rejeita %s = %j', (field, value, message) => {
    const result = registerSchema.safeParse({ ...valid, [field]: value });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe('loginSchema', () => {
  it('aceita senha curta (regra de tamanho só vale no cadastro)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(true);
  });

  it('exige senha', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});
