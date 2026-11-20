import { type ReactNode, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * A coluna de canais (servidor ou DMs). No PC ela fica sempre visível; em tela
 * estreita (celular) vira uma gaveta aberta pelo botão ☰ (o CSS decide quando).
 *
 * Fecha sozinha ao trocar de página: guardamos em qual endereço ela foi aberta,
 * então tocar num canal (que muda o endereço) já a esconde, sem precisar de efeito.
 */
export function ChannelDrawer({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const close = () => setOpenAt(null);

  return (
    <>
      <button
        type="button"
        className="drawer-toggle"
        aria-label={open ? 'Fechar canais' : 'Abrir canais'}
        aria-expanded={open}
        onClick={() => setOpenAt(open ? null : pathname)}
      >
        ☰
      </button>
      {open && <div className="drawer-backdrop" aria-hidden="true" onClick={close} />}
      <aside className={open ? 'channel-bar channel-bar--open' : 'channel-bar'}>{children}</aside>
    </>
  );
}
