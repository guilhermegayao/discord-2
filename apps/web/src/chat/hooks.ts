import type {
  CreateChannelData,
  CreateGuildData,
  GuildDto,
  GuildWithChannelsDto,
} from '@discord-2/shared';
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as chatApi from '../api/chat';
import { useAuth } from '../auth/AuthContext';
import {
  type ChatMessage,
  markMessageFailed,
  type MessagePage,
  type MessagesData,
  queryKeys,
  removeChannel,
  removeMessage,
  replaceMessage,
  upsertChannel,
  upsertMessage,
} from './cache';

export function useGuilds() {
  return useQuery({ queryKey: queryKeys.guilds, queryFn: chatApi.listGuilds });
}

/** `data === null` significa "este servidor foi apagado" (ver markGuildDeleted). */
export function useGuild(guildId: string | undefined) {
  return useQuery<GuildWithChannelsDto | null>({
    queryKey: queryKeys.guild(guildId ?? ''),
    queryFn: () => chatApi.getGuild(guildId!),
    enabled: Boolean(guildId),
  });
}

/**
 * Tira o servidor da lista e marca o cache dele como `null`. A tela aberta
 * nele percebe na hora e sai. (Remover a query do cache não bastaria: quem
 * já está observando continuaria vendo os dados antigos.)
 */
export function markGuildDeleted(queryClient: QueryClient, guildId: string): void {
  queryClient.setQueryData<GuildDto[]>(queryKeys.guilds, (list) =>
    list?.filter((g) => g.id !== guildId),
  );
  queryClient.setQueryData<GuildWithChannelsDto | null>(queryKeys.guild(guildId), null);
}

/** Histórico do canal em páginas; a próxima página é a das mensagens mais antigas. */
export function useMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(channelId),
    queryFn: ({ pageParam }): Promise<MessagePage> => chatApi.listMessages(channelId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages.at(-1)?.id : undefined),
  });
}

export function addGuildToList(queryClient: QueryClient, guild: GuildDto) {
  queryClient.setQueryData<GuildDto[]>(queryKeys.guilds, (list) =>
    list && !list.some((g) => g.id === guild.id) ? [...list, guild] : list,
  );
}

export function useCreateGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGuildData) => chatApi.createGuild(data),
    onSuccess: (guild) => {
      const { channels: _channels, ...summary } = guild;
      addGuildToList(queryClient, summary);
      queryClient.setQueryData(queryKeys.guild(guild.id), guild);
    },
  });
}

export function useDeleteGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => chatApi.deleteGuild(guildId),
    onSuccess: (_, guildId) => markGuildDeleted(queryClient, guildId),
  });
}

export function useCreateChannel(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChannelData) => chatApi.createChannel(guildId, data),
    onSuccess: (channel) => {
      queryClient.setQueryData<GuildWithChannelsDto | null>(queryKeys.guild(guildId), (guild) =>
        upsertChannel(guild, channel),
      );
    },
  });
}

export function useDeleteChannel(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => chatApi.deleteChannel(channelId),
    onSuccess: (_, channelId) => {
      queryClient.setQueryData<GuildWithChannelsDto | null>(queryKeys.guild(guildId), (guild) =>
        removeChannel(guild, channelId),
      );
      queryClient.removeQueries({ queryKey: queryKeys.messages(channelId) });
    },
  });
}

/**
 * Envio otimista: a mensagem aparece na hora como "pendente", com um id
 * temporário que também vai para a API como nonce. Quando a confirmação
 * chega (resposta HTTP ou evento do socket, o que vier primeiro), o nonce
 * liga a pendente à real e ela é trocada sem duplicar.
 */
export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = queryKeys.messages(channelId);

  return useMutation({
    mutationFn: ({ content, nonce }: { content: string; nonce: string }) =>
      chatApi.sendMessage(channelId, content, nonce),
    onMutate: ({ content, nonce }) => {
      if (!user) return;
      const pending: ChatMessage = {
        id: nonce,
        channelId,
        author: { id: user.id, username: user.username, displayName: user.displayName },
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        status: 'pending',
      };
      queryClient.setQueryData<MessagesData>(key, (data) => upsertMessage(data, pending));
    },
    onSuccess: (message) => {
      queryClient.setQueryData<MessagesData>(key, (data) => upsertMessage(data, message));
    },
    onError: (_, { nonce }) => {
      queryClient.setQueryData<MessagesData>(key, (data) => markMessageFailed(data, nonce));
    },
  });
}

export function useEditMessage(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      chatApi.editMessage(id, content),
    onSuccess: (message) => {
      queryClient.setQueryData<MessagesData>(queryKeys.messages(channelId), (data) =>
        replaceMessage(data, message),
      );
    },
  });
}

export function useDeleteMessage(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData<MessagesData>(queryKeys.messages(channelId), (data) =>
        removeMessage(data, messageId),
      );
    },
  });
}

/** Tira uma mensagem que falhou do histórico (para tentar de novo ou descartar). */
export function useDiscardMessage(channelId: string) {
  const queryClient = useQueryClient();
  return (tempId: string) =>
    queryClient.setQueryData<MessagesData>(queryKeys.messages(channelId), (data) =>
      removeMessage(data, tempId),
    );
}
