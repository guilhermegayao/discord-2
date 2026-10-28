/**
 * Canais de IPC (mensagens entre o processo principal e a página).
 * O preload repete estes nomes como texto, porque um preload em sandbox não
 * pode importar outros arquivos; um teste garante que os dois batem.
 */
export const IPC = {
  pickerRequest: 'screen-picker:request',
  pickerResponse: 'screen-picker:response',
} as const;
