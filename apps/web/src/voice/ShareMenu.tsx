import { useState } from 'react';
import { DEFAULT_SHARE_PRESET, SHARE_PRESETS, type SharePreset } from './screenShare';

interface Props {
  onStart: (preset: SharePreset) => void;
  onClose: () => void;
}

/** Escolha da qualidade antes de abrir o seletor de tela do navegador. */
export function ShareMenu({ onStart, onClose }: Props) {
  const [preset, setPreset] = useState<SharePreset>(DEFAULT_SHARE_PRESET);

  return (
    <div className="share-menu" role="group" aria-label="Qualidade da transmissão">
      <fieldset>
        <legend>Qualidade</legend>
        {(Object.keys(SHARE_PRESETS) as SharePreset[]).map((key) => (
          <label key={key} className="share-menu__option">
            <input
              type="radio"
              name="share-preset"
              value={key}
              checked={preset === key}
              onChange={() => setPreset(key)}
            />
            <span>
              <strong>{SHARE_PRESETS[key].label}</strong>
              <span className="muted"> — {SHARE_PRESETS[key].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="share-menu__actions">
        <button type="button" className="button--secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onStart(preset);
          }}
        >
          Escolher tela
        </button>
      </div>
    </div>
  );
}
