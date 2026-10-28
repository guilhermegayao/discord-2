import type { GuildDto, GuildWithChannelsDto, ServerToClientEvents } from '@discord-2/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  type MessagesData,
  queryKeys,
  removeChannel,
  removeMessage,
  replaceMessage,
  upsertChannel,
  upsertMessage,
} from '../chat/cache';
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
    const setGuild = (
      id: string,
      fn: (g?: GuildWithChannelsDto) => GuildWithChannelsDto | undefined,
    ) => queryClient.setQueryData<GuildWithChannelsDto>(queryKeys.guild(id), fn);
    const setMessages = (channelId: string, fn: (d?: MessagesData) => MessagesData | undefined) =>
      queryClient.setQueryData<MessagesData>(queryKeys.messages(channelId), fn);
    const setGuildList = (fn: (list?: GuildDto[]) => GuildDto[] | undefined) =>
      queryClient.setQueryData<GuildDto[]>(queryKeys.guilds, fn);

    const handlers: ServerToClientEvents = {
      'message:created': (m) => setMessages(m.channelId, (d) => upsertMessage(d, m)),
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
        setGuild(guild.id, () => guild);
      },
      'guild:updated': (guild) => {
        setGuildList((list) => list?.map((g) => (g.id === guild.id ? guild : g)));
        setGuild(guild.id, (g) => (g ? { ...g, ...guild } : g));
      },
      'guild:deleted': ({ id }) => {
        setGuildList((list) => list?.filter((g) => g.id !== id));
        queryClient.removeQueries({ queryKey: queryKeys.guild(id) });
      },
    };

    // Em toda (re)conexão, recarrega o que estiver na tela: cobre os eventos
    // perdidos enquanto o socket esteve desconectado.
    const onConnect = () => void queryClient.invalidateQueries();

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
