import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  type IpcMainEvent,
  MessageChannelMain,
  session,
  shell,
} from 'electron';
import os from 'node:os';
import path from 'node:path';
import { resolveAppUrl } from './config.js';
import { IPC } from './ipc.js';
import { isAppUrl, isPermissionAllowed, isSafeExternalUrl } from './navigation.js';
import { PickerBroker, toPickerSources } from './picker.js';
import { isSystemAudioSupported, loadLoopback, SystemAudioSession } from './systemAudio.js';

const appUrl = resolveAppUrl();
const broker = new PickerBroker();
const loopback = loadLoopback();
const systemAudioAvailable = isSystemAudioSupported(process.platform, os.release(), loopback);
let mainWindow: BrowserWindow | null = null;
let systemAudio: SystemAudioSession | null = null;

/**
 * Liga o som do PC (sem o próprio app) e entrega à página o canal por onde
 * ele chega. Excluir o processo principal exclui também os filhos dele,
 * inclusive o processo que toca o áudio da chamada: por isso não há eco.
 */
function startSystemAudio(win: BrowserWindow): void {
  systemAudio?.stop();
  systemAudio = null;
  if (!loopback || !systemAudioAvailable) return;
  const { port1, port2 } = new MessageChannelMain();
  systemAudio = new SystemAudioSession(loopback, process.pid, port1, (message) =>
    console.error(`[som do PC] ${message}`),
  );
  win.webContents.postMessage(IPC.systemAudioPort, null, [port2]);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    title: 'discord-2',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // A página é um site: nada de Node, contexto isolado e sandbox.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // O áudio do PC começa depois de várias esperas (longe do clique); sem
      // isto o AudioContext da página nasceria pausado.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => win.show());

  // Nunca navegar para fora do app dentro da janela; links externos vão para o navegador.
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, appUrl)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    broker.cancelAll();
    systemAudio?.stop();
    systemAudio = null;
    mainWindow = null;
  });

  void win.loadURL(appUrl.toString());
  return win;
}

function configureSession(): void {
  const ses = session.defaultSession;

  // Microfone e captura de tela: só para o próprio app.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isPermissionAllowed(permission, webContents.getURL(), appUrl));
  });
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, appUrl),
  );

  /**
   * Quando o front chama getDisplayMedia (botão "Compartilhar tela"), em vez
   * do seletor do Chromium mostramos o nosso, desenhado pelo próprio front.
   * O áudio não vai por aqui: o loopback do Electron levaria as vozes da
   * chamada junto (eco). Ele vem do módulo nativo, por startSystemAudio().
   */
  ses.setDisplayMediaRequestHandler((request, callback) => {
    void (async () => {
      const win = mainWindow;
      if (!win || !isAppUrl(request.securityOrigin ?? request.frame?.url ?? '', appUrl)) {
        callback({});
        return;
      }
      const raw = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const sources = toPickerSources(raw, win.getMediaSourceId());
      const choice = await broker.request(sources, (requestId) =>
        win.webContents.send(IPC.pickerRequest, {
          requestId,
          sources,
          systemAudio: systemAudioAvailable,
        }),
      );
      const chosen = raw.find((s) => s.id === choice?.sourceId);
      if (chosen && choice?.includeAudio) startSystemAudio(win);
      callback(chosen ? { video: chosen } : {});
    })().catch(() => callback({}));
  });
}

ipcMain.on(
  IPC.pickerResponse,
  (event: IpcMainEvent, requestId: unknown, sourceId: unknown, includeAudio: unknown) => {
    // Só aceita resposta da nossa janela e com os tipos certos.
    if (event.sender !== mainWindow?.webContents) return;
    if (typeof requestId !== 'string') return;
    broker.respond(
      requestId,
      typeof sourceId === 'string' ? sourceId : null,
      includeAudio === true,
    );
  },
);

// Uma instância só: abrir de novo traz a janela existente para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('dev.guilhermegayao.discord2');
    configureSession();
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
