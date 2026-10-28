import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { CreateGuildModal } from '../chat/CreateGuildModal';
import { initials } from '../chat/format';
import { useGuilds } from '../chat/hooks';
import { useRealtimeSync } from '../realtime/useRealtimeSync';

/** Estrutura da área logada: barra de servidores à esquerda + conteúdo. */
export function AppLayout() {
  useRealtimeSync();
  const { user, logout } = useAuth();
  const guilds = useGuilds();
  const [creating, setCreating] = useState(false);

  return (
    <div className="shell">
      <nav className="guild-bar" aria-label="Servidores">
        <ul>
          <li>
            <NavLink
              to="/channels/@me"
              className="guild-bar__item guild-bar__dms"
              title="Mensagens diretas"
              aria-label="Mensagens diretas"
            >
              💬
            </NavLink>
          </li>
          <li className="guild-bar__separator" aria-hidden="true" />
          {guilds.data?.map((guild) => (
            <li key={guild.id}>
              <NavLink
                to={`/channels/${guild.id}`}
                className="guild-bar__item"
                title={guild.name}
                aria-label={guild.name}
              >
                {initials(guild.name)}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="guild-bar__item guild-bar__add"
              title="Criar servidor"
              aria-label="Criar servidor"
              onClick={() => setCreating(true)}
            >
              +
            </button>
          </li>
        </ul>

        <div className="guild-bar__user">
          <span className="avatar" title={`${user?.displayName} (@${user?.username})`}>
            {initials(user?.displayName ?? '')}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => void logout()}
            aria-label="Sair"
          >
            Sair
          </button>
        </div>
      </nav>

      <Outlet />

      {creating && <CreateGuildModal onClose={() => setCreating(false)} />}
    </div>
  );
}
