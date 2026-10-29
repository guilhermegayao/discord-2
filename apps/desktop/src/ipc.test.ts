import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SYSTEM_AUDIO_MESSAGE } from '@discord-2/shared';
import { describe, expect, it } from 'vitest';
import { IPC } from './ipc.js';

/**
 * O preload (em sandbox) não pode importar ipc.ts, então repete os nomes dos
 * canais. Se alguém mudar um lado e esquecer o outro, o seletor para de
 * funcionar em silêncio; este teste pega isso.
 */
describe('canais de IPC', () => {
  const preload = readFileSync(path.join(__dirname, 'preload.ts'), 'utf8');

  it.each(Object.entries(IPC))('%s (%s) aparece igual no preload', (_name, channel) => {
    expect(preload).toContain(`'${channel}'`);
  });

  it('o tipo da mensagem do som do PC aparece igual no preload', () => {
    expect(preload).toContain(`'${SYSTEM_AUDIO_MESSAGE}'`);
  });

  it('o preload não importa arquivos do projeto (proibido em sandbox)', () => {
    const runtimeImports = [...preload.matchAll(/^import (?!type )[^;]+from '([^']+)'/gm)].map(
      (m) => m[1],
    );
    expect(runtimeImports).toEqual(['electron']);
  });
});
