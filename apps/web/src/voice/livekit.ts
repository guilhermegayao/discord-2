import { Room } from 'livekit-client';

/**
 * Único ponto que cria a sala do LiveKit. Os testes trocam este módulo por
 * uma sala falsa (não há WebRTC nem microfone no ambiente de teste).
 */
export function createRoom(): Room {
  return new Room({
    // Só baixa qualidade/streams que alguém está de fato usando.
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export async function listAudioDevices(kind: 'audioinput' | 'audiooutput') {
  return Room.getLocalDevices(kind);
}
