import { vi } from 'vitest';

type Listener = (...args: unknown[]) => void;
type Source = 'microphone' | 'screen_share' | 'screen_share_audio';

export class FakeTrack {
  setVolume = vi.fn();
  attach = vi.fn(() => document.createElement(this.kind === 'audio' ? 'audio' : 'video'));
  detach = vi.fn((): HTMLElement[] => []);

  constructor(public kind: 'audio' | 'video') {}
}

/** Algo que um participante transmite (microfone, tela, áudio da tela). */
export class FakePublication {
  subscribed = false;
  setSubscribed = vi.fn((on: boolean) => {
    this.subscribed = on;
  });

  constructor(
    public source: Source,
    public track: FakeTrack,
  ) {}
}

export class FakeParticipant {
  trackPublications = new Map<string, FakePublication>();

  constructor(
    public identity: string,
    public name: string,
    public isMicrophoneEnabled = true,
  ) {}

  get audioTrackPublications(): Map<string, FakePublication> {
    return new Map([...this.trackPublications].filter(([, p]) => p.track.kind === 'audio'));
  }

  get isScreenShareEnabled(): boolean {
    return [...this.trackPublications.values()].some((p) => p.source === 'screen_share');
  }

  publication(source: Source): FakePublication | undefined {
    return [...this.trackPublications.values()].find((p) => p.source === source);
  }

  /** Simula o microfone desta pessoa. */
  withAudio() {
    this.trackPublications.set('mic', new FakePublication('microphone', new FakeTrack('audio')));
    return this;
  }

  /** Simula esta pessoa transmitindo a tela (imagem + áudio da tela). */
  withScreen() {
    this.trackPublications.set(
      'screen',
      new FakePublication('screen_share', new FakeTrack('video')),
    );
    this.trackPublications.set(
      'screen-audio',
      new FakePublication('screen_share_audio', new FakeTrack('audio')),
    );
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
  /** Se definido, compartilhar a tela falha com este erro (ex.: seletor cancelado). */
  shareError: Error | null = null;
  sharing = false;

  override get isScreenShareEnabled(): boolean {
    return this.sharing;
  }

  setMicrophoneEnabled = vi.fn((on: boolean) => {
    if (on && this.micError) return Promise.reject(this.micError);
    this.isMicrophoneEnabled = on;
    return Promise.resolve();
  });

  setScreenShareEnabled = vi.fn((on: boolean, _capture?: unknown, _publish?: unknown) => {
    if (on && this.shareError) return Promise.reject(this.shareError);
    this.sharing = on;
    return Promise.resolve();
  });
}

/** Sala do LiveKit de mentira: guarda os listeners e deixa o teste disparar eventos. */
export class FakeRoom {
  private listeners = new Map<string, Set<Listener>>();
  localParticipant = new FakeLocalParticipant('me', 'Eu');
  remoteParticipants = new Map<string, FakeParticipant>();
  connect = vi.fn((_url: string, _token: string, _options?: unknown) => Promise.resolve());
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

  /** Alguém começa a transmitir a tela: publica e avisa a sala. */
  startRemoteScreen(p: FakeParticipant): void {
    p.withScreen();
    this.fire('trackPublished', p.publication('screen_share'), p);
    this.fire('trackPublished', p.publication('screen_share_audio'), p);
  }

  /** Simula o LiveKit entregando uma faixa assinada. */
  deliver(p: FakeParticipant, source: Source): void {
    const pub = p.publication(source);
    if (pub) this.fire('trackSubscribed', pub.track, pub, p);
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
