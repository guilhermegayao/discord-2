import { describe, expect, it } from 'vitest';
import { initials } from './format';

describe('initials', () => {
  it.each([
    ['Os Amigos', 'OA'],
    ['Ana (teste)', 'AT'],
    ['guilherme', 'G'],
    ['  sala   dos jogos ', 'SD'],
    ['élan vital', 'ÉV'],
    ['2026 turma', '2T'],
    ['(((', '?'],
    ['', '?'],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
