import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import type { Env } from '../config/env.js';

/** Configuração e clientes do LiveKit, num lugar só (e fácil de trocar nos testes). */
export interface LiveKit {
  /** Endereço que vai para o navegador. */
  url: string;
  apiKey: string;
  apiSecret: string;
  syncOnStart: boolean;
  /** API de administração: listar salas/participantes, remover alguém. */
  rooms: Pick<
    RoomServiceClient,
    'listRooms' | 'listParticipants' | 'removeParticipant' | 'deleteRoom'
  >;
  /** Confere a assinatura dos webhooks. */
  webhooks: Pick<WebhookReceiver, 'receive'>;
}

export const LIVEKIT = Symbol('LIVEKIT');

export const liveKitProvider: Provider = {
  provide: LIVEKIT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): LiveKit => {
    const url = config.get('LIVEKIT_URL', { infer: true });
    const apiKey = config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = config.get('LIVEKIT_API_SECRET', { infer: true });
    const apiUrl = config.get('LIVEKIT_API_URL', { infer: true }) ?? url.replace(/^ws/, 'http');

    return {
      url,
      apiKey,
      apiSecret,
      syncOnStart: config.get('LIVEKIT_SYNC_ON_START', { infer: true }),
      rooms: new RoomServiceClient(apiUrl, apiKey, apiSecret),
      webhooks: new WebhookReceiver(apiKey, apiSecret),
    };
  },
};
