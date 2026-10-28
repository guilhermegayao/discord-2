import type { GuildWithChannelsDto, InviteExpiration, MemberDto } from '@discord-2/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as socialApi from '../api/social';
import { useAuth } from '../auth/AuthContext';
import {
  activeTypers,
  type PresenceMap,
  queryKeys,
  removeMember,
  type TypingMap,
  upsertDm,
} from './cache';
import { addGuildToList, markGuildDeleted } from './hooks';

/**
 * Dados que só existem no cliente (presença por eventos, "digitando").
 * O queryFn devolve o que já está no cache: assim um invalidateQueries()
 * geral não apaga o que os eventos preencheram.
 */
function useLocalState<T>(key: readonly unknown[], empty: T) {
  const queryClient = useQueryClient();
  const { data } = useQuery<T>({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<T>(key) ?? empty,
    initialData: empty,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? empty;
}

export function usePresence(): PresenceMap {
  return useLocalState<PresenceMap>(queryKeys.presence, {});
}

/** Online segundo os eventos; se ainda não chegou evento, o valor que veio da API. */
export function isOnline(presence: PresenceMap, userId: string, fallback: boolean): boolean {
  return presence[userId] ?? fallback;
}

export function useMembers(guildId: string) {
  return useQuery({
    queryKey: queryKeys.members(guildId),
    queryFn: () => socialApi.listMembers(guildId),
  });
}

/** Lista de membros já com a presença mais recente aplicada, online primeiro. */
export function useMembersWithPresence(guildId: string): MemberDto[] | undefined {
  const members = useMembers(guildId).data;
  const presence = usePresence();
  return members
    ?.map((m) => ({ ...m, online: isOnline(presence, m.user.id, m.online) }))
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        a.user.displayName.localeCompare(b.user.displayName, 'pt-BR'),
    );
}

export function useDms() {
  return useQuery({ queryKey: queryKeys.dms, queryFn: socialApi.listDms });
}

export function useOpenDm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => socialApi.openDm(userId),
    onSuccess: (dm) => {
      queryClient.setQueryData(queryKeys.dms, (list: Parameters<typeof upsertDm>[0]) =>
        list?.some((d) => d.id === dm.id) ? list : upsertDm(list, dm),
      );
    },
  });
}

export function useCreateInvite(guildId: string) {
  return useMutation({
    mutationFn: (expiresIn: InviteExpiration) => socialApi.createInvite(guildId, expiresIn),
  });
}

export function useInvitePreview(code: string) {
  return useQuery({
    queryKey: queryKeys.invite(code),
    queryFn: () => socialApi.previewInvite(code),
  });
}

export function joinGuildInCache(queryClient: QueryClient, guild: GuildWithChannelsDto) {
  const { channels: _channels, ...summary } = guild;
  addGuildToList(queryClient, summary);
  queryClient.setQueryData(queryKeys.guild(guild.id), guild);
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => socialApi.acceptInvite(code),
    onSuccess: (guild) => joinGuildInCache(queryClient, guild),
  });
}

export function useLeaveGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => socialApi.leaveGuild(guildId),
    onSuccess: (_, guildId) => markGuildDeleted(queryClient, guildId),
  });
}

export function useKickMember(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => socialApi.kickMember(guildId, userId),
    onSuccess: (_, userId) => {
      queryClient.setQueryData<MemberDto[]>(queryKeys.members(guildId), (list) =>
        removeMember(list, userId),
      );
    },
  });
}

/** Quem está digitando agora neste canal (some sozinho depois de alguns segundos). */
export function useTypingUsers(channelId: string) {
  const { user } = useAuth();
  const typing = useLocalState<TypingMap>(queryKeys.typing(channelId), {});
  const [now, setNow] = useState(() => Date.now());

  const hasEntries = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!hasEntries) return;
    // Reavalia a cada segundo para os avisos vencidos sumirem da tela.
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasEntries]);

  return activeTypers(typing, user?.id, now);
}
