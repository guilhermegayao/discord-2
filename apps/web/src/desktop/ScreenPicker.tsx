import type { PickerRequest, PickerSource } from '@discord-2/shared';
import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { getDesktopBridge } from './bridge';

type Tab = 'screen' | 'window';

/**
 * Seletor de tela/janela do app desktop (no navegador, quem mostra o seletor
 * é o próprio Chrome). O Electron intercepta o "compartilhar tela", manda a
 * lista para cá, e a escolha volta para ele.
 */
export function ScreenPicker() {
  const [request, setRequest] = useState<PickerRequest | null>(null);
  const [tab, setTab] = useState<Tab>('screen');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onScreenPickerRequest((incoming) => {
      setRequest(incoming);
      setSelected(null);
      // Se não houver tela (raro), começa na aba de janelas.
      setTab(incoming.sources.some((s) => s.kind === 'screen') ? 'screen' : 'window');
    });
  }, []);

  if (!request) return null;

  const answer = (sourceId: string | null) => {
    getDesktopBridge()?.respondScreenPicker(request.requestId, sourceId);
    setRequest(null);
  };

  const visible = request.sources.filter((s) => s.kind === tab);

  return (
    <Modal title="Compartilhar tela" onClose={() => answer(null)}>
      <div className="picker">
        <div className="picker__tabs" role="tablist" aria-label="Tipo de fonte">
          {(['screen', 'window'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={tab === kind}
              className={tab === kind ? '' : 'button--secondary'}
              onClick={() => setTab(kind)}
            >
              {kind === 'screen' ? 'Telas' : 'Janelas'}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="muted">Nada para mostrar aqui.</p>
        ) : (
          <ul className="picker__grid" aria-label={tab === 'screen' ? 'Telas' : 'Janelas'}>
            {visible.map((source) => (
              <SourceOption
                key={source.id}
                source={source}
                selected={selected === source.id}
                onSelect={() => setSelected(source.id)}
                onConfirm={() => answer(source.id)}
              />
            ))}
          </ul>
        )}

        <p className="muted picker__note">
          🔇 O áudio do sistema ainda não vai junto no app (chega na próxima versão). Para
          transmitir com som agora, use o navegador e compartilhe uma aba.
        </p>

        <div className="modal__actions">
          <button type="button" className="button--secondary" onClick={() => answer(null)}>
            Cancelar
          </button>
          <button type="button" disabled={!selected} onClick={() => answer(selected)}>
            Compartilhar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SourceOption({
  source,
  selected,
  onSelect,
  onConfirm,
}: {
  source: PickerSource;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`picker__option${selected ? ' picker__option--selected' : ''}`}
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onConfirm}
      >
        <img src={source.thumbnail} alt="" className="picker__thumb" />
        <span className="picker__name">
          {source.appIcon && <img src={source.appIcon} alt="" className="picker__icon" />}
          {source.name}
        </span>
      </button>
    </li>
  );
}
