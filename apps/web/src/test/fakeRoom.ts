import { vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

export class FakeParticipant {
  audioTrackPublications = new Map<string, { track: { setVolume: ReturnType<typeof vi.fn> } }>();

  constructor(
    public identity: string,
    public name: string,
    public isMicrophoneEnabled = true,
  ) {}

  /** Simula uma faixa de áudio recebida desta pessoa. */
  withAudio() {
    this.audioTrackPublications.set('a', { track: { setVolume: vi.fn() } });
    return this;
  }

  get volumes(): number[] {
    return [...this.audioTrackPublications.values()].flatMap((p) =>
      p.track.setVolume.mock.calls.map((c) => c[0] as number),
    );
  }
}

export class FakeLocalParticipant extends FakeParticipant {
  /** Se definido, ligar o microfone falha com este erro (ex.: permissão negada). */
  micError: Error | null = null;

  setMicrophoneEnabled = vi.fn((on: boolean) => {
    if (on && this.micError) return Promise.reject(this.micError);
    this.isMicrophoneEnabled = on;
    return Promise.resolve();
  });
}

/** Sala do LiveKit de mentira: guarda os listeners e deixa o teste disparar eventos. */
export class FakeRoom {
  private listeners = new Map<string, Set<Listener>>();
  localParticipant = new FakeLocalParticipant('me', 'Eu');
  remoteParticipants = new Map<string, FakeParticipant>();
  connect = vi.fn(() => Promise.resolve());
  disconnect = vi.fn(() => Promise.resolve());
  switchActiveDevice = vi.fn(() => Promise.resolve(true));

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  /** Dispara um evento como se viesse do LiveKit. */
  fire(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((l) => l(...args));
  }

  addRemote(p: FakeParticipant): void {
    this.remoteParticipants.set(p.identity, p);
    this.fire('participantConnected', p);
  }
}

/** Salas criadas pelo app, na ordem (a última é a atual). */
export const rooms: FakeRoom[] = [];

/** Ajuste aplicado à próxima sala criada (ex.: microfone bloqueado, falha ao conectar). */
export const nextRoom: { setup?: (room: FakeRoom) => void } = {};

export function lastRoom(): FakeRoom {
  const room = rooms.at(-1);
  if (!room) throw new Error('nenhuma sala foi criada');
  return room;
}
