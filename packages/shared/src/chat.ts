import { z } from 'zod';

// ---------- Entradas (validadas no servidor e nos formulários) ----------

export const guildNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Dê um nome ao servidor' })
  .max(100, { error: 'O nome pode ter no máximo 100 caracteres' });

/** Nomes de canal no estilo Discord: minúsculas, sem espaços ("Bate Papo" vira "bate-papo"). */
export const channelNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((name) => name.replace(/\s+/g, '-'))
  .pipe(
    z
      .string()
      .min(1, { error: 'Dê um nome ao canal' })
      .max(100, { error: 'O nome pode ter no máximo 100 caracteres' })
      .regex(/^[\p{L}\p{N}_-]+$/u, { error: 'Use só letras, números, "-" e "_"' }),
  );

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, { error: 'A mensagem está vazia' })
  .max(2000, { error: 'A mensagem pode ter no máximo 2000 caracteres' });

export const createGuildSchema = z.object({ name: guildNameSchema });
export type CreateGuildInput = z.input<typeof createGuildSchema>;
export type CreateGuildData = z.output<typeof createGuildSchema>;

export const updateGuildSchema = createGuildSchema;
export type UpdateGuildData = z.output<typeof updateGuildSchema>;

export const createChannelSchema = z.object({ name: channelNameSchema });
export type CreateChannelInput = z.input<typeof createChannelSchema>;
export type CreateChannelData = z.output<typeof createChannelSchema>;

export const updateChannelSchema = createChannelSchema;
export type UpdateChannelData = z.output<typeof updateChannelSchema>;

export const createMessageSchema = z.object({
  content: messageContentSchema,
  /**
   * Id gerado pelo cliente para a mensagem otimista. Volta no evento
   * message:created, para o cliente trocar a versão "pendente" pela real.
   */
  nonce: z.string().min(1).max(64).optional(),
});
export type CreateMessageData = z.output<typeof createMessageSchema>;

export const updateMessageSchema = z.object({ content: messageContentSchema });
export type UpdateMessageData = z.output<typeof updateMessageSchema>;

export const MESSAGE_PAGE_MAX = 100;

export const messagePageQuerySchema = z.object({
  /** Cursor: traz mensagens mais antigas que esta (ids UUID v7 são ordenados por tempo). */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MESSAGE_PAGE_MAX).default(50),
});
export type MessagePageQuery = z.output<typeof messagePageQuerySchema>;

// ---------- Saídas da API ----------

export const channelSchema = z.object({
  id: z.string(),
  guildId: z.string(),
  name: z.string(),
  type: z.enum(['TEXT']),
  position: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type ChannelDto = z.infer<typeof channelSchema>;

export const guildSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.iso.datetime(),
});
export type GuildDto = z.infer<typeof guildSchema>;

export const guildWithChannelsSchema = guildSchema.extend({
  channels: z.array(channelSchema),
});
export type GuildWithChannelsDto = z.infer<typeof guildWithChannelsSchema>;

export const messageAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type MessageAuthorDto = z.infer<typeof messageAuthorSchema>;

export const messageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  author: messageAuthorSchema,
  content: z.string(),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  /** Só presente na resposta/evento de criação, quando o cliente enviou um nonce. */
  nonce: z.string().optional(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const messagePageSchema = z.object({
  /** Da mais nova para a mais antiga. */
  messages: z.array(messageSchema),
  /** Se existem mensagens mais antigas que a última desta página. */
  hasMore: z.boolean(),
});
export type MessagePageDto = z.infer<typeof messagePageSchema>;

// ---------- Eventos em tempo real (Socket.IO) ----------

export interface MessageDeletedEvent {
  id: string;
  channelId: string;
}

export interface ChannelDeletedEvent {
  id: string;
  guildId: string;
}

export interface GuildDeletedEvent {
  id: string;
}

/**
 * Eventos que o servidor emite. Servidor e web usam esta mesma interface,
 * então um evento com nome ou formato errado não compila.
 */
export interface ServerToClientEvents {
  'message:created': (message: MessageDto) => void;
  'message:updated': (message: MessageDto) => void;
  'message:deleted': (event: MessageDeletedEvent) => void;
  'channel:created': (channel: ChannelDto) => void;
  'channel:updated': (channel: ChannelDto) => void;
  'channel:deleted': (event: ChannelDeletedEvent) => void;
  'guild:created': (guild: GuildWithChannelsDto) => void;
  'guild:updated': (guild: GuildDto) => void;
  'guild:deleted': (event: GuildDeletedEvent) => void;
}

/** O cliente não envia eventos: toda escrita passa pela API REST. */
export type ClientToServerEvents = Record<string, never>;
