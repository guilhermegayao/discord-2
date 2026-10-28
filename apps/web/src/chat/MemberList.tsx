import type { MemberDto } from '@discord-2/shared';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { initials } from './format';
import { useKickMember, useMembersWithPresence, useOpenDm } from './socialHooks';

interface Props {
  guildId: string;
  ownerId: string;
}

/** Coluna da direita: membros do servidor, online primeiro. */
export function MemberList({ guildId, ownerId }: Props) {
  const members = useMembersWithPresence(guildId);
  const online = members?.filter((m) => m.online) ?? [];
  const offline = members?.filter((m) => !m.online) ?? [];

  return (
    <aside className="member-bar" aria-label="Membros">
      {!members ? (
        <p className="muted member-bar__loading">Carregando membros…</p>
      ) : (
        <>
          <MemberSection
            title={`Online — ${online.length}`}
            members={online}
            guildId={guildId}
            ownerId={ownerId}
          />
          <MemberSection
            title={`Offline — ${offline.length}`}
            members={offline}
            guildId={guildId}
            ownerId={ownerId}
          />
        </>
      )}
    </aside>
  );
}

function MemberSection({
  title,
  members,
  guildId,
  ownerId,
}: Props & { title: string; members: MemberDto[] }) {
  if (members.length === 0) return null;
  return (
    <section>
      <h2 className="member-bar__title">{title}</h2>
      <ul>
        {members.map((m) => (
          <MemberRow key={m.user.id} member={m} guildId={guildId} ownerId={ownerId} />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({ member, guildId, ownerId }: Props & { member: MemberDto }) {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const openDm = useOpenDm();
  const kick = useKickMember(guildId);
  const { user } = member;
  const isMe = user.id === me?.id;
  const iAmOwner = me?.id === ownerId;

  const onMessage = async () => {
    const dm = await openDm.mutateAsync(user.id);
    await navigate(`/channels/@me/${dm.id}`);
  };

  const onKick = () => {
    if (window.confirm(`Expulsar ${user.displayName} do servidor?`)) kick.mutate(user.id);
  };

  return (
    <li className={`member${member.online ? '' : ' member--offline'}`}>
      <span className="avatar avatar--small">
        {initials(user.displayName)}
        <span
          className={`status-dot status-dot--${member.online ? 'online' : 'offline'}`}
          aria-label={member.online ? 'online' : 'offline'}
          role="img"
        />
      </span>
      <span className="member__name" title={`@${user.username}`}>
        {user.displayName}
        {member.role === 'OWNER' && (
          <span className="member__owner" title="Dono do servidor" aria-label="dono">
            {' '}
            👑
          </span>
        )}
      </span>
      {!isMe && (
        <span className="member__actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Enviar mensagem para ${user.displayName}`}
            title="Enviar mensagem"
            onClick={() => void onMessage()}
          >
            💬
          </button>
          {iAmOwner && member.role !== 'OWNER' && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Expulsar ${user.displayName}`}
              title="Expulsar"
              onClick={onKick}
            >
              ⛔
            </button>
          )}
        </span>
      )}
    </li>
  );
}
