import {
  type ScreenShareCaptureOptions,
  ScreenSharePresets,
  type TrackPublishOptions,
} from 'livekit-client';

export type SharePreset = 'motion' | 'detail' | 'economy';

interface PresetConfig {
  label: string;
  description: string;
  capture: ScreenShareCaptureOptions;
  publish: TrackPublishOptions;
}

/** O que vale para as três qualidades. */
const common: ScreenShareCaptureOptions = {
  // Áudio da aba (Chrome/Edge) ou do sistema ao compartilhar a tela inteira (Windows).
  audio: true,
  systemAudio: 'include',
  // Não oferecer a própria aba do app (daria o efeito "espelho infinito").
  selfBrowserSurface: 'exclude',
  // Permite trocar a aba compartilhada sem parar a transmissão.
  surfaceSwitching: 'include',
};

/**
 * As três qualidades de transmissão. Todos os números (resolução, fps, taxa
 * de bits) ficam aqui, num lugar só, para o ajuste fino no fim do projeto.
 *
 * - contentHint diz ao navegador o que priorizar: "motion" mantém a
 *   fluidez (abaixa a nitidez se faltar banda); "detail" mantém o texto
 *   legível (abaixa os fps).
 * - A camada extra (simulcast) é uma versão menor da mesma tela, enviada
 *   junto: quem tem internet ruim recebe essa, sem travar para os outros.
 */
export const SHARE_PRESETS: Record<SharePreset, PresetConfig> = {
  motion: {
    label: 'Vídeo/jogo',
    description: '1080p a 30 fps, fluido',
    capture: {
      ...common,
      resolution: ScreenSharePresets.h1080fps30.resolution,
      contentHint: 'motion',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
      screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
      simulcast: true,
    },
  },
  detail: {
    label: 'Texto/código',
    description: '1080p nítido, até 15 fps',
    capture: {
      ...common,
      resolution: ScreenSharePresets.h1080fps15.resolution,
      contentHint: 'detail',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
      screenShareSimulcastLayers: [ScreenSharePresets.h720fps5],
      simulcast: true,
    },
  },
  economy: {
    label: 'Economia',
    description: '720p a 15 fps, usa menos internet',
    capture: {
      ...common,
      resolution: ScreenSharePresets.h720fps15.resolution,
      contentHint: 'motion',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 1_200_000, maxFramerate: 15 },
      screenShareSimulcastLayers: [ScreenSharePresets.h360fps3],
      simulcast: true,
    },
  },
};

export const DEFAULT_SHARE_PRESET: SharePreset = 'motion';

export function canShareScreen(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}
