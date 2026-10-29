import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type AudioPortLike,
  isSystemAudioSupported,
  loadLoopback,
  type LoopbackModule,
  SystemAudioSession,
} from './systemAudio.js';

/** Módulo nativo falso: guarda o callback para o teste "tocar" áudio. */
function fakeLoopback() {
  const captures: {
    pid: number;
    emit: (samples: Float32Array | null, error?: string) => void;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const module: LoopbackModule = {
    LoopbackCapture: class {
      start = vi.fn();
      stop = vi.fn();
      constructor(pid: number, onEvent: (samples: Float32Array | null, error?: string) => void) {
        captures.push({ pid, emit: onEvent, start: this.start, stop: this.stop });
      }
    },
  };
  /** A captura criada pela sessão (cada teste cria uma só). */
  const capture = () => {
    const created = captures.at(-1);
    if (!created) throw new Error('nenhuma captura criada');
    return created;
  };
  return { module, capture };
}

function fakePort() {
  let onClose = () => undefined as void;
  const port = {
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    on: vi.fn((_event: 'close', listener: () => void) => {
      onClose = listener;
    }),
  } satisfies AudioPortLike;
  return { port, closeFromPage: () => onClose() };
}

describe('isSystemAudioSupported', () => {
  const { module } = fakeLoopback();

  it('só no Windows 11 (build 20348+) e com o módulo carregado', () => {
    expect(isSystemAudioSupported('win32', '10.0.26200', module)).toBe(true);
    expect(isSystemAudioSupported('win32', '10.0.20348', module)).toBe(true);
    expect(isSystemAudioSupported('win32', '10.0.19045', module)).toBe(false);
    expect(isSystemAudioSupported('win32', '10.0.26200', null)).toBe(false);
    expect(isSystemAudioSupported('linux', '6.8.0', module)).toBe(false);
  });
});

describe('loadLoopback', () => {
  it('sem o .node compilado, devolve null (o app segue sem som do PC)', () => {
    expect(loadLoopback(path.join(__dirname, 'pasta-que-nao-existe'))).toBeNull();
  });
});

describe('SystemAudioSession', () => {
  it('captura excluindo o processo do app e manda o áudio para a página', () => {
    const { module, capture } = fakeLoopback();
    const { port } = fakePort();

    new SystemAudioSession(module, 4242, port);
    capture().emit(new Float32Array([0.1, -0.1]));

    expect(capture().pid).toBe(4242);
    expect(capture().start).toHaveBeenCalledOnce();
    expect(port.start).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledWith(new Float32Array([0.1, -0.1]));
  });

  it('a página fechar o canal desliga a captura', () => {
    const { module, capture } = fakeLoopback();
    const { port, closeFromPage } = fakePort();
    const session = new SystemAudioSession(module, 1, port);

    closeFromPage();
    capture().emit(new Float32Array([0.5, 0.5]));

    expect(session.active).toBe(false);
    expect(capture().stop).toHaveBeenCalledOnce();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('erro na captura avisa, desliga e fecha o canal', () => {
    const { module, capture } = fakeLoopback();
    const { port } = fakePort();
    const onError = vi.fn();
    new SystemAudioSession(module, 1, port, onError);

    capture().emit(null, 'Ativação do áudio falhou');

    expect(onError).toHaveBeenCalledWith('Ativação do áudio falhou');
    expect(capture().stop).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('parar duas vezes não quebra', () => {
    const { module, capture } = fakeLoopback();
    const session = new SystemAudioSession(module, 1, fakePort().port);

    session.stop();
    session.stop();

    expect(capture().stop).toHaveBeenCalledOnce();
  });
});

// Teste de fumaça do módulo de verdade: só roda no Windows com o .node compilado
// (no CI, o job do Windows compila antes de testar).
const nativeFile = path.join(__dirname, '..', 'native', 'build', 'Release', 'loopback.node');
describe.runIf(process.platform === 'win32' && existsSync(nativeFile))('módulo nativo', () => {
  it('liga e desliga a captura sem erro', async () => {
    const loopback = loadLoopback();
    expect(loopback).not.toBeNull();
    const errors: string[] = [];
    const capture = new loopback!.LoopbackCapture(process.pid, (samples, error) => {
      if (!samples) errors.push(error ?? '');
    });

    capture.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    capture.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errors).toEqual([]);
  });
});
