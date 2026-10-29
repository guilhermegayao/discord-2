/**
 * Fila do som do PC entre o app (pedaços de ~10 ms) e o AudioWorklet (blocos
 * de 128 amostras). Áudio estéreo intercalado: [E, D, E, D, ...].
 *
 * Os dois lados têm relógios diferentes (a placa de som captura num ritmo, o
 * navegador toca em outro), então a fila precisa de dois cuidados:
 * - começar só com uma pequena reserva, para não engasgar a cada pedaço;
 * - nunca acumular atraso: se crescer demais, descarta o mais antigo.
 */
export class PcmQueue {
  private readonly buffer: Float32Array;
  private readIndex = 0;
  private size = 0;
  private primed = false;

  constructor(
    private readonly startFrames = 1920, // 40 ms a 48 kHz
    private readonly maxFrames = 4800, // 100 ms: acima disso, atraso perceptível
  ) {
    this.buffer = new Float32Array(maxFrames * 2);
  }

  /** Quantos quadros (pares E/D) estão esperando. */
  get frames(): number {
    return this.size;
  }

  push(chunk: Float32Array): void {
    const frames = Math.floor(chunk.length / 2);
    for (let i = 0; i < frames; i++) {
      if (this.size === this.maxFrames) {
        // Cheia: joga fora o quadro mais antigo para não atrasar.
        this.readIndex = (this.readIndex + 1) % this.maxFrames;
        this.size--;
      }
      const writeIndex = (this.readIndex + this.size) % this.maxFrames;
      this.buffer[writeIndex * 2] = chunk[i * 2] ?? 0;
      this.buffer[writeIndex * 2 + 1] = chunk[i * 2 + 1] ?? 0;
      this.size++;
    }
  }

  /** Preenche os dois canais. Sem áudio suficiente, entrega silêncio. */
  pull(left: Float32Array, right: Float32Array): void {
    const frames = left.length;
    if (!this.primed && this.size >= this.startFrames) this.primed = true;
    if (!this.primed || this.size < frames) {
      // Faltou áudio: silêncio e espera juntar a reserva de novo.
      this.primed = false;
      left.fill(0);
      right.fill(0);
      return;
    }
    for (let i = 0; i < frames; i++) {
      left[i] = this.buffer[this.readIndex * 2] ?? 0;
      right[i] = this.buffer[this.readIndex * 2 + 1] ?? 0;
      this.readIndex = (this.readIndex + 1) % this.maxFrames;
    }
    this.size -= frames;
  }
}
