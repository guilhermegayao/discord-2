/**
 * AudioWorklet do som do PC (roda na thread de áudio do navegador).
 * Recebe o MessagePort que vem do app, guarda os pedaços numa PcmQueue e
 * entrega 128 amostras por vez, que viram uma faixa de áudio normal.
 */
import { PcmQueue } from './pcmQueue';

// Globais do escopo de AudioWorklet (não estão na lib DOM do TypeScript).
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class SystemAudioProcessor extends AudioWorkletProcessor {
  private readonly queue = new PcmQueue();
  private source: MessagePort | null = null;
  private closed = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data === 'close') {
        // Fechar o canal avisa o app, que desliga a captura.
        this.source?.close();
        this.closed = true;
        return;
      }
      const [port] = event.ports;
      if (!port) return;
      this.source = port;
      port.onmessage = (message: MessageEvent) => {
        if (message.data instanceof Float32Array) this.queue.push(message.data);
      };
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0] ?? [];
    if (left && right) this.queue.pull(left, right);
    return !this.closed;
  }
}

registerProcessor('system-audio', SystemAudioProcessor);
