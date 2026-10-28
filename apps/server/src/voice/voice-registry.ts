import { Injectable } from '@nestjs/common';
import type { PublicUserDto, VoiceChannelStateDto, VoiceParticipantDto } from '@discord-2/shared';

interface VoiceRoom {
  guildId: string;
  participants: Map<string, VoiceParticipantDto>;
}

/**
 * Quem está em cada canal de voz (e quem está transmitindo a tela), em
 * memória. A fonte da verdade é o LiveKit: este registro é atualizado pelos
 * webhooks dele e sincronizado quando o servidor sobe. (Com várias
 * instâncias do Nest, iria para o Redis.)
 */
@Injectable()
export class VoiceRegistry {
  private readonly rooms = new Map<string, VoiceRoom>();

  join(channelId: string, guildId: string, user: PublicUserDto, streaming = false): void {
    const room = this.rooms.get(channelId) ?? { guildId, participants: new Map() };
    // Entrada repetida (webhook duplicado) não apaga o "transmitindo" de quem já estava.
    const previous = room.participants.get(user.id);
    room.participants.set(user.id, {
      ...user,
      streaming: streaming || (previous?.streaming ?? false),
    });
    this.rooms.set(channelId, room);
  }

  /** Marca/desmarca o 🔴. Devolve o servidor do canal se algo mudou. */
  setStreaming(channelId: string, userId: string, streaming: boolean): string | undefined {
    const room = this.rooms.get(channelId);
    const participant = room?.participants.get(userId);
    if (!room || !participant || participant.streaming === streaming) return undefined;
    room.participants.set(userId, { ...participant, streaming });
    return room.guildId;
  }

  /** Devolve o servidor do canal, se ele estava sendo acompanhado. */
  leave(channelId: string, userId: string): string | undefined {
    const room = this.rooms.get(channelId);
    if (!room) return undefined;
    room.participants.delete(userId);
    if (room.participants.size === 0) this.rooms.delete(channelId);
    return room.guildId;
  }

  clear(channelId: string): string | undefined {
    const guildId = this.rooms.get(channelId)?.guildId;
    this.rooms.delete(channelId);
    return guildId;
  }

  state(channelId: string): VoiceChannelStateDto {
    const participants = [...(this.rooms.get(channelId)?.participants.values() ?? [])];
    return { channelId, participants };
  }

  /** Canais de voz do servidor que têm alguém conectado. */
  forGuild(guildId: string): VoiceChannelStateDto[] {
    return [...this.rooms.entries()]
      .filter(([, room]) => room.guildId === guildId)
      .map(([channelId]) => this.state(channelId));
  }

  /** Canais deste servidor em que o usuário está (normalmente um só). */
  channelsOf(userId: string, guildId: string): string[] {
    return [...this.rooms.entries()]
      .filter(([, room]) => room.guildId === guildId && room.participants.has(userId))
      .map(([channelId]) => channelId);
  }
}
