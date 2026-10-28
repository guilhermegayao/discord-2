import type { GuildWithChannelsDto } from '@discord-2/shared';
import { useOutletContext } from 'react-router';

/** O que o GuildLayout passa para o canal aberto (via <Outlet context>). */
export interface GuildContext {
  guild: GuildWithChannelsDto;
  isOwner: boolean;
}

export function useGuildContext(): GuildContext {
  return useOutletContext<GuildContext>();
}
