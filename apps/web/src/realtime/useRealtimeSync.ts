import type {
  DmChannelDto,
  GuildDto,
  GuildWithChannelsDto,
  MemberDto,
  ServerToClientEvents,
} from '@discord-2/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  type MessagesData,
  type PresenceMap,
  queryKeys,
  removeChannel,
  removeMember,
  removeMessage,
  replaceMessage,
  type TypingMap,
  upsertChannel,
  upsertDm,
  upsertMember,
  upsertMessage,
} from '../chat/cache';
import { markGuildDeleted } from '../chat/hooks';
import { disconnectSocket, getSocket } from './socket';

/**
 * Liga o socket enquanto o usuário está logado e traduz cada evento em uma
 * atualização do cache do TanStack Query. As telas não sabem que o socket
 * existe: elas só leem o cache, que se atualiza sozinho.
 */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    /** Atualiza um servidor que está no cache (ignora se não carregado ou já apagado). */
    const setGuild = (
      id: string,
      fn: (g: GuildWithChannelsDto) => GuildWithChannelsDto | null | undefined,
    ) =>
      queryClient.setQueryData<GuildWithChannelsDto | null>(queryKeys.guild(id), (g) =>
        g ? fn(g) : g,
      );
    const setMessages = (channelId: string, fn: (d?: MessagesData) => MessagesData | undefined) =>
      queryClient.setQueryData<MessagesData>(queryKeys.messages(channelId), fn);
    const setGuildList = (fn: (list?: GuildDto[]) => GuildDto[] | undefined) =>
      queryClient.setQueryData<GuildDto[]>(queryKeys.guilds, fn);
    const setPresence = (userId: string, online: boolean) =>
      queryClient.setQueryData<PresenceMap>(queryKeys.presence, (p) => ({
        ...p,
        [userId]: online,
      }));

    const setTyping = (channelId: string, fn: (t: TypingMap) => TypingMap) =>
      queryClient.setQueryData<TypingMap>(queryKeys.typing(channelId), (t) => fn(t ?? {}));

    const handlers: ServerToClientEvents = {
      'message:created': (m) => {
        setMessages(m.channelId, (d) => upsertMessage(d, m));
        // Quem mandou a mensagem parou de digitar.
        setTyping(m.channelId, ({ [m.author.id]: _sent, ...rest }) => rest);
        // A conversa com a última mensagem sobe para o topo da lista de DMs.
        queryClient.setQueryData<DmChannelDto[]>(queryKeys.dms, (list) => {
          const dm = list?.find((d) => d.id === m.channelId);
          return dm ? upsertDm(list, { ...dm, lastMessageAt: m.createdAt }) : list;
        });
      },
      'message:updated': (m) => setMessages(m.channelId, (d) => replaceMessage(d, m)),
      'message:deleted': ({ id, channelId }) => setMessages(channelId, (d) => removeMessage(d, id)),
      'channel:created': (c) => setGuild(c.guildId, (g) => upsertChannel(g, c)),
      'channel:updated': (c) => setGuild(c.guildId, (g) => upsertChannel(g, c)),
      'channel:deleted': ({ id, guildId }) => {
        setGuild(guildId, (g) => removeChannel(g, id));
        queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
      },
      'guild:created': (guild) => {
        const { channels: _channels, ...summary } = guild;
        setGuildList((list) =>
          list && !list.some((g) => g.id === guild.id) ? [...list, summary] : list,
        );
        queryClient.setQueryData(queryKeys.guild(guild.id), guild);
      },
      'guild:updated': (guild) => {
        setGuildList((list) => list?.map((g) => (g.id === guild.id ? guild : g)));
        setGuild(guild.id, (g) => ({ ...g, ...guild }));
      },
      'guild:deleted': ({ id }) => markGuildDeleted(queryClient, id),
      'guild:removed': ({ id }) => markGuildDeleted(queryClient, id),
      'member:joined': ({ guildId, member }) => {
        queryClient.setQueryData<MemberDto[]>(queryKeys.members(guildId), (list) =>
          upsertMember(list, member),
        );
        setPresence(member.user.id, member.online);
      },
      'member:left': ({ guildId, userId }) =>
        queryClient.setQueryData<MemberDto[]>(queryKeys.members(guildId), (list) =>
          removeMember(list, userId),
        ),
      'presence:update': ({ userId, online }) => setPresence(userId, online),
      typing: ({ channelId, user }) =>
        setTyping(channelId, (t) => ({ ...t, [user.id]: { user, at: Date.now() } })),
      'dm:created': (dm) =>
        queryClient.setQueryData<DmChannelDto[]>(queryKeys.dms, (list) =>
          list?.some((d) => d.id === dm.id) ? list : upsertDm(list, dm),
        ),
    };

    // Em toda (re)conexão, recarrega o que estiver na tela: cobre os eventos
    // perdidos enquanto o socket esteve desconectado. A presença guardada pode
    // estar velha; zera para valer a que vem da API.
    const onConnect = () => {
      queryClient.setQueryData<PresenceMap>(queryKeys.presence, {});
      void queryClient.invalidateQueries();
    };

    const events = Object.keys(handlers) as (keyof ServerToClientEvents)[];
    socket.on('connect', onConnect);
    events.forEach((event) => socket.on(event, handlers[event]));
    socket.connect();

    // Remove só o que este efeito registrou (o socket.ts tem listeners próprios).
    return () => {
      socket.off('connect', onConnect);
      events.forEach((event) => socket.off(event, handlers[event]));
      disconnectSocket();
    };
  }, [queryClient]);
}
