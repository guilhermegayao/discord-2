import { messageContentSchema } from '@discord-2/shared';
import { type KeyboardEvent, useState } from 'react';
import type { ChatMessage } from './cache';
import { formatTimestamp } from './format';

interface Props {
  message: ChatMessage;
  /** Mostra autor e horário (falso quando continua uma sequência do mesmo autor). */
  showHeader: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (content: string) => Promise<unknown>;
  onDelete: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

export function MessageItem({
  message,
  showHeader,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onRetry,
  onDiscard,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isLocal = message.status !== undefined;

  const save = async () => {
    const parsed = messageContentSchema.safeParse(draft);
    if (!parsed.success || parsed.data === message.content) {
      setEditing(false);
      return;
    }
    await onEdit(parsed.data);
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <li
      className={`message${showHeader ? ' message--first' : ''}${
        message.status ? ` message--${message.status}` : ''
      }`}
      aria-busy={message.status === 'pending' || undefined}
    >
      {showHeader && (
        <div className="message__header">
          <strong>{message.author.displayName}</strong>
          <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
        </div>
      )}

      {editing ? (
        <div className="message__edit">
          <textarea
            aria-label="Editar mensagem"
            value={draft}
            maxLength={2000}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="muted">Esc para cancelar • Enter para salvar</span>
        </div>
      ) : (
        <p className="message__content">
          {message.content}
          {message.editedAt && <span className="message__edited"> (editada)</span>}
        </p>
      )}

      {message.status === 'failed' && (
        <p className="message__failed" role="alert">
          Não foi possível enviar.{' '}
          <button type="button" className="link-button" onClick={onRetry}>
            Tentar de novo
          </button>{' '}
          <button type="button" className="link-button" onClick={onDiscard}>
            Descartar
          </button>
        </p>
      )}

      {!isLocal && !editing && (canEdit || canDelete) && (
        <div className="message__actions">
          {canEdit && (
            <button
              type="button"
              className="icon-button"
              aria-label="Editar mensagem"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              ✏️
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="icon-button"
              aria-label="Apagar mensagem"
              onClick={onDelete}
            >
              🗑
            </button>
          )}
        </div>
      )}
    </li>
  );
}
