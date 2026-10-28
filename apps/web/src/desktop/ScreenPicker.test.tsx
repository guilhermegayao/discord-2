import type { DesktopBridge, PickerRequest } from '@discord-2/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenPicker } from './ScreenPicker';

/** Ponte falsa: guarda o listener e deixa o teste "abrir" o seletor como o Electron faria. */
function installBridge() {
  let listener: ((request: PickerRequest) => void) | undefined;
  const bridge: DesktopBridge = {
    platform: 'win32',
    onScreenPickerRequest: vi.fn((l: (request: PickerRequest) => void) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    }),
    respondScreenPicker: vi.fn(),
  };
  (window as Window & { desktop?: DesktopBridge }).desktop = bridge;
  return {
    bridge,
    open: (request: PickerRequest) => act(() => listener?.(request)),
  };
}

const request: PickerRequest = {
  requestId: 'pick-1',
  sources: [
    {
      id: 'screen:0:0',
      name: 'Tela 1',
      kind: 'screen',
      thumbnail: 'data:image/png;base64,AA',
      appIcon: null,
    },
    {
      id: 'window:7:0',
      name: 'Meu Jogo',
      kind: 'window',
      thumbnail: 'data:image/png;base64,BB',
      appIcon: 'data:image/png;base64,CC',
    },
  ],
};

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop');
});

describe('<ScreenPicker /> (app desktop)', () => {
  it('no navegador comum não faz nada', () => {
    const { container } = render(<ScreenPicker />);

    expect(container).toBeEmptyDOMElement();
  });

  it('abre quando o app pede, começando pelas telas', () => {
    const { open } = installBridge();
    render(<ScreenPicker />);

    open(request);

    expect(screen.getByRole('dialog', { name: 'Compartilhar tela' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Telas' })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('list', { name: 'Telas' })).getByText('Tela 1'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Meu Jogo')).not.toBeInTheDocument();
  });

  it('escolher uma janela e compartilhar devolve o id ao app', async () => {
    const user = userEvent.setup();
    const { bridge, open } = installBridge();
    render(<ScreenPicker />);
    open(request);

    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Janelas' }));
    await user.click(screen.getByRole('button', { name: /Meu Jogo/ }));
    await user.click(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(bridge.respondScreenPicker).toHaveBeenCalledWith('pick-1', 'window:7:0');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('duplo clique compartilha direto', async () => {
    const user = userEvent.setup();
    const { bridge, open } = installBridge();
    render(<ScreenPicker />);
    open(request);

    await user.dblClick(screen.getByRole('button', { name: /Tela 1/ }));

    expect(bridge.respondScreenPicker).toHaveBeenCalledWith('pick-1', 'screen:0:0');
  });

  it('cancelar (botão ou Esc) devolve null ao app', async () => {
    const user = userEvent.setup();
    const { bridge, open } = installBridge();
    render(<ScreenPicker />);

    open(request);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    open({ ...request, requestId: 'pick-2' });
    await user.keyboard('{Escape}');

    expect(bridge.respondScreenPicker).toHaveBeenNthCalledWith(1, 'pick-1', null);
    expect(bridge.respondScreenPicker).toHaveBeenNthCalledWith(2, 'pick-2', null);
  });

  it('avisa que o áudio do sistema ainda não vai junto no app', () => {
    const { open } = installBridge();
    render(<ScreenPicker />);

    open(request);

    expect(screen.getByText(/áudio do sistema ainda não vai junto/)).toBeInTheDocument();
  });
});
