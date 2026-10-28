import type { ChannelDto, GuildWithChannelsDto, MessageDto } from '@discord-2/shared';
import type { InfiniteData } from '@tanstack/react-query';

export const queryKeys = {
  guilds: ['guilds'] as const,
  guild: (guildId: string) => ['guild', guildId] as const,
  messages: (channelId: string) => ['messages', channelId] as const,
};

/** Mensagem como o front a guarda: pode estar "pendente" (otimista) ou ter falhado. */
export type ChatMessage = MessageDto & { status?: 'pending' | 'failed' };

export interface MessagePage {
  /** Da mais nova para a mais antiga (como a API devolve). */
  messages: ChatMessage[];
  hasMore: boolean;
}

export type MessagesData = InfiniteData<MessagePage, string | undefined>;

function mapMessages(
  data: MessagesData,
  fn: (messages: ChatMessage[]) => ChatMessage[],
): MessagesData {
  return { ...data, pages: data.pages.map((page) => ({ ...page, messages: fn(page.messages) })) };
}

/**
 * Coloca uma mensagem no histórico do canal, sem duplicar:
 * - se já existe (mesmo id), substitui;
 * - se é a confirmação de uma mensagem otimista (mesmo nonce), troca a pendente pela real;
 * - senão, entra no topo (é a mais nova).
 * Assim tanto faz chegar primeiro a resposta da API ou o evento do socket.
 */
export function upsertMessage(
  data: MessagesData | undefined,
  message: ChatMessage,
): MessagesData | undefined {
  if (!data) return data;
  const all = data.pages.flatMap((p) => p.messages);

  if (all.some((m) => m.id === message.id)) {
    return mapMessages(data, (msgs) => msgs.map((m) => (m.id === message.id ? message : m)));
  }
  if (message.nonce && all.some((m) => m.id === message.nonce)) {
    return mapMessages(data, (msgs) => msgs.map((m) => (m.id === message.nonce ? message : m)));
  }

  const [first, ...rest] = data.pages;
  const firstPage = first ?? { messages: [], hasMore: false };
  return {
    ...data,
    pages: [{ ...firstPage, messages: [message, ...firstPage.messages] }, ...rest],
  };
}

export function replaceMessage(
  data: MessagesData | undefined,
  message: MessageDto,
): MessagesData | undefined {
  if (!data) return data;
  return mapMessages(data, (msgs) => msgs.map((m) => (m.id === message.id ? message : m)));
}

export function removeMessage(
  data: MessagesData | undefined,
  messageId: string,
): MessagesData | undefined {
  if (!data) return data;
  return mapMessages(data, (msgs) => msgs.filter((m) => m.id !== messageId));
}

export function markMessageFailed(
  data: MessagesData | undefined,
  tempId: string,
): MessagesData | undefined {
  if (!data) return data;
  return mapMessages(data, (msgs) =>
    msgs.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m)),
  );
}

/** Insere ou atualiza um canal na lista do servidor, mantendo a ordem por posição. */
/** `null` = servidor apagado; `undefined` = ainda não carregado. Nos dois casos, nada muda. */
type CachedGuild = GuildWithChannelsDto | null | undefined;

export function upsertChannel(guild: CachedGuild, channel: ChannelDto): CachedGuild {
  if (!guild) return guild;
  const others = guild.channels.filter((c) => c.id !== channel.id);
  return { ...guild, channels: [...others, channel].sort((a, b) => a.position - b.position) };
}

export function removeChannel(guild: CachedGuild, channelId: string): CachedGuild {
  if (!guild) return guild;
  return { ...guild, channels: guild.channels.filter((c) => c.id !== channelId) };
}
