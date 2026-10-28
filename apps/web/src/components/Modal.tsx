import { type ReactNode, useEffect, useId } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Diálogo simples: fecha com Esc ou clicando fora. */
export function Modal({ title, onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="card modal">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
