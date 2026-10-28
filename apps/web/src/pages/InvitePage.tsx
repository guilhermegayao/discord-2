import { Link, useNavigate, useParams } from 'react-router';
import { useAcceptInvite, useInvitePreview } from '../chat/socialHooks';

/** /invite/:code — prévia do servidor e botão de aceitar. */
export function InvitePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const preview = useInvitePreview(code);
  const accept = useAcceptInvite();

  const onAccept = async () => {
    const guild = await accept.mutateAsync(code);
    await navigate(`/channels/${guild.id}`, { replace: true });
  };

  return (
    <main className="auth">
      <div className="card invite-card">
        {preview.isPending && <p className="muted">Carregando convite…</p>}

        {preview.isError && (
          <>
            <h1>Convite inválido</h1>
            <p className="muted">Este convite expirou ou foi revogado. Peça um novo link.</p>
            <Link to="/channels">Ir para o app</Link>
          </>
        )}

        {preview.data && (
          <>
            <p className="muted">Você foi convidado para entrar em</p>
            <h1>{preview.data.guild.name}</h1>
            <p className="muted">
              {preview.data.memberCount} {preview.data.memberCount === 1 ? 'membro' : 'membros'}
            </p>
            {preview.data.alreadyMember ? (
              <button
                type="button"
                onClick={() => void navigate(`/channels/${preview.data.guild.id}`)}
              >
                Você já está neste servidor — abrir
              </button>
            ) : (
              <button type="button" onClick={() => void onAccept()} disabled={accept.isPending}>
                {accept.isPending ? 'Entrando…' : 'Aceitar convite'}
              </button>
            )}
            {accept.isError && (
              <p className="form-error" role="alert">
                Não foi possível entrar. O convite pode ter acabado de expirar.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
