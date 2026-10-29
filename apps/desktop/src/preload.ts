/**
 * Ponte entre a página (o front web) e o app. Roda em sandbox, com
 * contextIsolation: a página só enxerga o objeto `window.desktop` abaixo,
 * nunca o Node nem o ipcRenderer inteiro.
 *
 * Atenção: preload em sandbox não pode importar arquivos do projeto, então os
 * nomes dos canais estão repetidos aqui (o teste ipc.test.ts confere com ipc.ts).
 */
import type { DesktopBridge, PickerRequest } from '@discord-2/shared';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const PICKER_REQUEST = 'screen-picker:request';
const PICKER_RESPONSE = 'screen-picker:response';
const SYSTEM_AUDIO_PORT = 'system-audio:port';
const SYSTEM_AUDIO_MESSAGE = 'discord-2:system-audio';

const bridge: DesktopBridge = {
  platform: process.platform,
  onScreenPickerRequest(listener) {
    const handler = (_event: IpcRendererEvent, request: PickerRequest) => listener(request);
    ipcRenderer.on(PICKER_REQUEST, handler);
    return () => {
      ipcRenderer.removeListener(PICKER_REQUEST, handler);
    };
  },
  respondScreenPicker(requestId, sourceId, includeAudio) {
    ipcRenderer.send(PICKER_RESPONSE, requestId, sourceId, includeAudio);
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);

// O som do PC chega por um MessagePort, que não atravessa o contextBridge:
// repassamos para a página como mensagem da própria janela, só para a origem dela.
ipcRenderer.on(SYSTEM_AUDIO_PORT, (event: IpcRendererEvent) => {
  window.postMessage({ type: SYSTEM_AUDIO_MESSAGE }, window.location.origin, event.ports);
});
