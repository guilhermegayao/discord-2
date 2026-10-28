import type { InviteExpiration } from '@discord-2/shared';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useCreateInvite } from './socialHooks';

const EXPIRATION_LABELS: Record<InviteExpiration, string> = {
  '1d': '1 dia',
  '7d': '7 dias',
  never: 'Nunca',
};

interface Props {
  guildId: string;
  guildName: string;
  onClose: () => void;
}

export function InviteModal({ guildId, guildName, onClose }: Props) {
  const [expiresIn, setExpiresIn] = useState<InviteExpiration>('7d');
  const [copied, setCopied] = useState(false);
  const create = useCreateInvite(guildId);
  const link = create.data ? `${window.location.origin}/invite/${create.data.code}` : null;

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <Modal title={`Convidar amigos para ${guildName}`} onClose={onClose}>
      <div className="modal__form">
        <div className="field">
          <label htmlFor="invite-expiration">Expira em</label>
          <select
            id="invite-expiration"
            value={expiresIn}
            onChange={(e) => {
              setExpiresIn(e.target.value as InviteExpiration);
              create.reset();
              setCopied(false);
            }}
          >
            {Object.entries(EXPIRATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {link ? (
          <div className="invite-link">
            <input
              aria-label="Link de convite"
              value={link}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button type="button" onClick={() => void copy()}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => create.mutate(expiresIn)}
            disabled={create.isPending}
          >
            Gerar link de convite
          </button>
        )}

        {create.isError && (
          <p className="form-error" role="alert">
            Não foi possível gerar o convite.
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="button--secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
