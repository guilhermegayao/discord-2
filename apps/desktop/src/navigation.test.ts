import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_URL, resolveAppUrl } from './config.js';
import { isAppUrl, isPermissionAllowed, isSafeExternalUrl } from './navigation.js';

const app = new URL('http://localhost:5174');

describe('isAppUrl', () => {
  it.each([
    ['http://localhost:5174/channels/x', true],
    ['http://localhost:5174/invite/abc?x=1', true],
    ['http://localhost:3100/api', false], // outra porta = outra origem
    ['https://localhost:5174/', false], // outro protocolo
    ['http://localhost.evil.com:5174/', false],
    ['https://site-malicioso.com/login', false],
    ['javascript:alert(1)', false],
    ['não é url', false],
  ])('%s → %s', (url, expected) => {
    expect(isAppUrl(url, app)).toBe(expected);
  });
});

describe('isSafeExternalUrl', () => {
  it('só abre http(s) no navegador do sistema', () => {
    expect(isSafeExternalUrl('https://github.com')).toBe(true);
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('ms-settings:privacy')).toBe(false);
  });
});

describe('isPermissionAllowed', () => {
  it('libera microfone e captura de tela só para o próprio app', () => {
    expect(isPermissionAllowed('media', 'http://localhost:5174/channels', app)).toBe(true);
    expect(isPermissionAllowed('display-capture', 'http://localhost:5174/', app)).toBe(true);
    expect(isPermissionAllowed('media', 'https://outro-site.com/', app)).toBe(false);
  });

  it('nega o resto (geolocalização, notificações, USB...)', () => {
    for (const permission of ['geolocation', 'notifications', 'usb', 'hid', 'openExternal']) {
      expect(isPermissionAllowed(permission, 'http://localhost:5174/', app)).toBe(false);
    }
  });
});

describe('resolveAppUrl', () => {
  it('usa o Vite local por padrão', () => {
    expect(resolveAppUrl({}).toString()).toBe(`${DEFAULT_APP_URL}/`);
  });

  it('aceita outro endereço pela variável de ambiente', () => {
    expect(resolveAppUrl({ DISCORD2_APP_URL: 'https://discord2.exemplo.com' }).origin).toBe(
      'https://discord2.exemplo.com',
    );
  });

  it('recusa protocolos que não sejam http(s)', () => {
    expect(() => resolveAppUrl({ DISCORD2_APP_URL: 'file:///C:/app/index.html' })).toThrow();
  });
});
