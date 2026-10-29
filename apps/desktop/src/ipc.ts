/**
 * Canais de IPC (mensagens entre o processo principal e a página).
 * O preload repete estes nomes como texto, porque um preload em sandbox não
 * pode importar outros arquivos; um teste garante que os dois batem.
 */
export const IPC = {
  pickerRequest: 'screen-picker:request',
  pickerResponse: 'screen-picker:response',
  /** O processo principal entrega à página o canal (MessagePort) do som do PC. */
  systemAudioPort: 'system-audio:port',
} as const;
