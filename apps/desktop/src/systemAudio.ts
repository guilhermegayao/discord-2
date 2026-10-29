import path from 'node:path';

/**
 * Som do PC sem o próprio app (Fase 6b). A captura é feita pelo módulo
 * nativo `native/src/loopback.cc`; aqui fica o que dá para testar sem ele.
 */

/** O que o módulo nativo exporta. */
export interface LoopbackModule {
  LoopbackCapture: new (
    pid: number,
    onEvent: (samples: Float32Array | null, error?: string) => void,
  ) => { start(): void; stop(): void };
}

/** A parte de um MessagePortMain que usamos (facilita testar sem Electron). */
export interface AudioPortLike {
  postMessage(message: unknown): void;
  on(event: 'close', listener: () => void): unknown;
  start(): void;
  close(): void;
}

/** A captura por processo existe a partir do Windows build 20348 (Windows 11). */
export const MIN_WINDOWS_BUILD = 20348;

export function isSystemAudioSupported(
  platform: string,
  osRelease: string,
  loopback: LoopbackModule | null,
): boolean {
  if (platform !== 'win32' || !loopback) return false;
  const build = Number(osRelease.split('.')[2]);
  return Number.isFinite(build) && build >= MIN_WINDOWS_BUILD;
}

/**
 * Carrega o `.node`. No app instalado ele fica fora do `.asar` (o Windows
 * não abre DLL de dentro de um arquivo compactado), em `app.asar.unpacked`.
 * Se não existir (build sem C++, outro sistema), o app segue sem som do PC.
 */
export function loadLoopback(baseDir: string = __dirname): LoopbackModule | null {
  const file = path
    .join(baseDir, '..', 'native', 'build', 'Release', 'loopback.node')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  try {
    // Módulo nativo por caminho calculado: só dá para carregar com require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(file) as LoopbackModule;
  } catch {
    return null;
  }
}

/**
 * Uma transmissão de som do PC: liga a captura e manda cada pedaço de áudio
 * para a página pelo canal. A página fechar o canal (parou de transmitir,
 * recarregou, fechou) desliga a captura, e vice-versa.
 */
export class SystemAudioSession {
  private readonly capture: { start(): void; stop(): void };
  private stopped = false;

  constructor(
    loopback: LoopbackModule,
    excludePid: number,
    private readonly port: AudioPortLike,
    private readonly onError: (message: string) => void = () => undefined,
  ) {
    this.capture = new loopback.LoopbackCapture(excludePid, (samples, error) => {
      if (this.stopped) return;
      if (samples) {
        this.port.postMessage(samples);
      } else {
        this.onError(error ?? 'falha desconhecida');
        this.stop();
      }
    });
    port.on('close', () => this.stop());
    port.start();
    this.capture.start();
  }

  get active(): boolean {
    return !this.stopped;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.capture.stop();
    this.port.close();
  }
}
