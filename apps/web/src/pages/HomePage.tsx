import { useAuth } from '../auth/AuthContext';
import { ServerStatus } from '../components/ServerStatus';

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <main className="app">
      <header className="home__header">
        <div>
          <h1>Olá, {user?.displayName}!</h1>
          <p className="muted">@{user?.username}</p>
        </div>
        <button type="button" className="button--secondary" onClick={() => void logout()}>
          Sair
        </button>
      </header>
      <p className="muted">Servidores e chat chegam na Fase 2.</p>
      <ServerStatus />
    </main>
  );
}
