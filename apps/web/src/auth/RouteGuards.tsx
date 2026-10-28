import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { redirectTarget } from './redirect';

function Splash() {
  return (
    <main className="auth" aria-busy="true">
      <p className="muted">Carregando…</p>
    </main>
  );
}

/** Só deixa passar quem está logado; guarda a rota para voltar depois do login. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * Login e cadastro: quem já está logado vai para onde queria ir (ex.: o
 * convite) ou para a home. Usa o mesmo destino que as páginas, para as duas
 * navegações não competirem logo depois do login.
 */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state)} replace />;
  }
  return <Outlet />;
}
