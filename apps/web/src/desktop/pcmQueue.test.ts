import { describe, expect, it } from 'vitest';
import { PcmQueue } from './pcmQueue';

/** Pedaço estéreo intercalado em que E = valor e D = -valor. */
function chunk(frames: number, value: number): Float32Array {
  const data = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    data[i * 2] = value;
    data[i * 2 + 1] = -value;
  }
  return data;
}

function pull(queue: PcmQueue, frames = 4) {
  const left = new Float32Array(frames).fill(9);
  const right = new Float32Array(frames).fill(9);
  queue.pull(left, right);
  return { left: [...left], right: [...right] };
}

describe('PcmQueue', () => {
  it('espera a reserva mínima antes de tocar (silêncio até lá)', () => {
    const queue = new PcmQueue(8, 32);

    queue.push(chunk(4, 0.5));
    expect(pull(queue)).toEqual({ left: [0, 0, 0, 0], right: [0, 0, 0, 0] });

    queue.push(chunk(4, 0.5));
    expect(pull(queue)).toEqual({ left: [0.5, 0.5, 0.5, 0.5], right: [-0.5, -0.5, -0.5, -0.5] });
    expect(queue.frames).toBe(4);
  });

  it('separa os canais e mantém a ordem', () => {
    const queue = new PcmQueue(2, 32);
    queue.push(new Float32Array([0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4]));

    const { left, right } = pull(queue);

    expect(left.map((v) => v.toFixed(1))).toEqual(['0.1', '0.2', '0.3', '0.4']);
    expect(right.map((v) => v.toFixed(1))).toEqual(['-0.1', '-0.2', '-0.3', '-0.4']);
  });

  it('se faltar áudio, entrega silêncio e volta a juntar reserva', () => {
    const queue = new PcmQueue(4, 32);
    queue.push(chunk(6, 0.5));
    pull(queue); // sobram 2

    expect(pull(queue).left).toEqual([0, 0, 0, 0]);
    queue.push(chunk(1, 0.5)); // 3 < reserva de 4
    expect(pull(queue).left).toEqual([0, 0, 0, 0]);
  });

  it('nunca acumula mais que o limite: descarta o mais antigo', () => {
    const queue = new PcmQueue(1, 8);

    queue.push(chunk(8, 0.1));
    queue.push(chunk(4, 0.9));

    expect(queue.frames).toBe(8);
    expect(pull(queue).left.map((v) => v.toFixed(1))).toEqual(['0.1', '0.1', '0.1', '0.1']);
    expect(pull(queue).left.map((v) => v.toFixed(1))).toEqual(['0.9', '0.9', '0.9', '0.9']);
  });
});
