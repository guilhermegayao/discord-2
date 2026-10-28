import { useEffect, useState } from 'react';
import { listAudioDevices } from './livekit';
import { ShareMenu } from './ShareMenu';
import { useVoice } from './VoiceContext';

/** Barrinha no pé da coluna de canais: estado da voz e controles. */
export function VoicePanel() {
  const voice = useVoice();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (voice.status === 'idle') {
    return voice.error ? (
      <div className="voice-panel voice-panel--error" role="alert">
        <p>{voice.error}</p>
        <button type="button" className="link-button" onClick={voice.dismissError}>
          Fechar
        </button>
      </div>
    ) : null;
  }

  return (
    <section className="voice-panel" aria-label="Voz">
      <div className="voice-panel__status">
        <strong className={voice.status === 'connected' ? 'voice-panel__ok' : ''}>
          {voice.status === 'connected' ? 'Voz conectada' : 'Conectando…'}
        </strong>
        <span className="muted">🔊 {voice.channel?.name}</span>
      </div>

      {voice.error && (
        <p className="voice-panel__warning" role="alert">
          {voice.error}
        </p>
      )}

      <div className="voice-panel__buttons">
        <button
          type="button"
          className="icon-button"
          aria-label="Microfone"
          aria-pressed={!voice.micEnabled}
          title={voice.micEnabled ? 'Mutar microfone' : 'Ativar microfone'}
          disabled={voice.status !== 'connected'}
          onClick={() => void voice.toggleMic()}
        >
          {voice.micEnabled ? '🎙️' : '🔇'}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Ensurdecer"
          aria-pressed={voice.deafened}
          title={voice.deafened ? 'Voltar a ouvir' : 'Ensurdecer (não ouvir ninguém)'}
          disabled={voice.status !== 'connected'}
          onClick={() => void voice.toggleDeafen()}
        >
          {voice.deafened ? '🙉' : '🎧'}
        </button>
        {voice.sharing ? (
          <button
            type="button"
            className="icon-button voice-panel__live"
            aria-label="Parar de compartilhar a tela"
            title="Parar de compartilhar a tela"
            onClick={() => void voice.stopShare()}
          >
            ⏹️
          </button>
        ) : (
          <button
            type="button"
            className="icon-button"
            aria-label="Compartilhar tela"
            aria-expanded={shareOpen}
            title="Compartilhar tela"
            disabled={voice.status !== 'connected'}
            onClick={() => setShareOpen((o) => !o)}
          >
            🖥️
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Configurações de áudio"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          ⚙️
        </button>
        <button
          type="button"
          className="icon-button voice-panel__leave"
          aria-label="Sair da voz"
          title="Sair da voz"
          onClick={() => void voice.leave()}
        >
          📞
        </button>
      </div>

      {voice.sharing && <p className="voice-panel__sharing">🔴 Você está transmitindo a tela</p>}
      {shareOpen && !voice.sharing && (
        <ShareMenu
          onStart={(preset) => void voice.startShare(preset)}
          onClose={() => setShareOpen(false)}
        />
      )}
      {settingsOpen && <DeviceSettings onSwitch={voice.switchDevice} />}
    </section>
  );
}

function DeviceSettings({
  onSwitch,
}: {
  onSwitch: (kind: 'audioinput' | 'audiooutput', deviceId: string) => Promise<void>;
}) {
  const [devices, setDevices] = useState<{
    inputs: MediaDeviceInfo[];
    outputs: MediaDeviceInfo[];
  }>();

  useEffect(() => {
    let active = true;
    Promise.all([listAudioDevices('audioinput'), listAudioDevices('audiooutput')]).then(
      ([inputs, outputs]) => active && setDevices({ inputs, outputs }),
      () => active && setDevices({ inputs: [], outputs: [] }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (!devices) return <p className="muted voice-panel__devices">Carregando dispositivos…</p>;

  return (
    <div className="voice-panel__devices">
      <div className="field">
        <label htmlFor="voice-input">Microfone</label>
        <select id="voice-input" onChange={(e) => void onSwitch('audioinput', e.target.value)}>
          {devices.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Microfone'}
            </option>
          ))}
        </select>
      </div>
      {devices.outputs.length > 0 && (
        <div className="field">
          <label htmlFor="voice-output">Saída de áudio</label>
          <select id="voice-output" onChange={(e) => void onSwitch('audiooutput', e.target.value)}>
            {devices.outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Alto-falante'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
