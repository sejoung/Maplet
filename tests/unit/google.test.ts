// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleConnection } from '../../src/adapters/drive/google';

const config = { clientId: 'public-client', apiKey: 'public-key', appId: 'project-number' };
function sdk(
  result: object = { access_token: 'memory-only', expires_in: 3600 },
  popupError = false,
) {
  const revoke = vi.fn((_token, callback) => callback({ successful: true }));
  const initTokenClient = vi.fn((options) => ({
    requestAccessToken: vi.fn(() =>
      popupError ? options.error_callback() : options.callback(result),
    ),
  }));
  window.google = { accounts: { oauth2: { initTokenClient, revoke } } } as unknown as NonNullable<
    typeof window.google
  >;
  return { initTokenClient, revoke };
}
afterEach(() => {
  sessionStorage.clear();
  delete window.google;
  delete window.gapi;
  document.querySelectorAll('script[src^="https://"]').forEach((script) => script.remove());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('optional Google SDK bridge', () => {
  it('requests only drive.file, keeps the token only in memory, expires it, and disconnects', async () => {
    vi.useFakeTimers();
    const { initTokenClient, revoke } = sdk();
    const connection = new GoogleConnection(config);
    expect(connection.getToken()).toBeNull();
    await connection.connect();
    expect(connection.getToken()).toBe('memory-only');
    expect(initTokenClient.mock.results[0].value.requestAccessToken).toHaveBeenCalledWith({
      prompt: '',
    });
    expect(initTokenClient.mock.calls[0][0].scope).toBe(
      'https://www.googleapis.com/auth/drive.file',
    );
    await connection.connect();
    vi.advanceTimersByTime(3600_000);
    expect(connection.getToken()).toBeNull();
    await connection.connect();
    await connection.disconnect();
    expect(revoke).toHaveBeenCalledWith('memory-only', expect.any(Function));
    expect(connection.getToken()).toBeNull();
    await connection.disconnect();
    expect(revoke).toHaveBeenCalledOnce();
    expect(JSON.stringify(localStorage)).not.toContain('memory-only');
    expect(sessionStorage.getItem('maplet:drive-session:public-client')).toBeNull();
  });
  it('reports not-ready SDK, consent denial, missing token and popup cancellation', async () => {
    await expect(new GoogleConnection(config).connect()).rejects.toThrow(/준비/);
    for (const result of [{ error: 'access_denied' }, {}]) {
      sdk(result);
      await expect(new GoogleConnection(config).connect()).rejects.toThrow(/취소/);
    }
    sdk({}, true);
    await expect(new GoogleConnection(config).connect()).rejects.toThrow(/차단/);
  });
  it('does not open Picker without a token and returns chosen file or cancel', async () => {
    const connection = new GoogleConnection(config);
    await expect(connection.pick()).rejects.toThrow(/먼저/);
    sdk();
    await connection.connect();
    let callback: (value: {
      action: string;
      docs?: { id: string; name: string }[];
    }) => void = () => {};
    const dispose = vi.fn();
    const visible = vi.fn();
    const view = {
      setIncludeFolders: vi.fn().mockReturnThis(),
      setSelectFolderEnabled: vi.fn().mockReturnThis(),
      setMode: vi.fn().mockReturnThis(),
      setParent: vi.fn().mockReturnThis(),
      setMimeTypes: vi.fn().mockReturnThis(),
    };
    const docsView = vi.fn(function () {
      return view;
    });
    const builder = {
      setLocale: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
      setDeveloperKey: vi.fn().mockReturnThis(),
      setAppId: vi.fn().mockReturnThis(),
      setOAuthToken: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      addView: vi.fn().mockReturnThis(),
      setCallback: vi.fn(function (value) {
        callback = value;
        return builder;
      }),
      build: vi.fn(() => ({ setVisible: visible, dispose })),
    };
    window.google!.picker = {
      PickerBuilder: class {
        constructor() {
          return builder;
        }
      },
      DocsView: docsView,
      DocsViewMode: { LIST: 'list' },
      ViewId: { DOCS: 'docs', FOLDERS: 'folders' },
    } as unknown as NonNullable<typeof window.google>['picker'];
    const selected = connection.pick();
    callback({ action: 'loaded' });
    callback({ action: 'picked', docs: [{ id: 'selected-id', name: 'Map.maplet' }] });
    await expect(selected).resolves.toEqual({ id: 'selected-id', name: 'Map.maplet' });
    expect(builder.setAppId).toHaveBeenCalledWith(config.appId);
    expect(docsView).toHaveBeenCalledWith('docs');
    expect(view.setSelectFolderEnabled).toHaveBeenLastCalledWith(false);
    expect(view.setMode).toHaveBeenCalledWith('list');
    expect(visible).toHaveBeenCalledWith(true);
    expect(dispose).toHaveBeenCalledOnce();
    const cancelled = connection.pick();
    callback({ action: 'cancel' });
    await expect(cancelled).resolves.toBeNull();
    const folder = connection.pick('folder', 'en');
    expect(docsView).toHaveBeenLastCalledWith('docs');
    expect(view.setParent).toHaveBeenLastCalledWith('root');
    expect(view.setMimeTypes).toHaveBeenLastCalledWith('application/vnd.google-apps.folder');
    expect(view.setSelectFolderEnabled).toHaveBeenLastCalledWith(true);
    expect(builder.setTitle).toHaveBeenLastCalledWith('Choose a save folder');
    expect(builder.setLocale).toHaveBeenLastCalledWith('en');
    callback({ action: 'picked', docs: [{ id: 'folder-id', name: 'Maps' }] });
    await expect(folder).resolves.toEqual({ id: 'folder-id', name: 'Maps' });
  });
  it('loads SDKs once on demand and handles Picker initialization', async () => {
    vi.resetModules();
    const { GoogleConnection: Connection } = await import('../../src/adapters/drive/google');
    window.gapi = { load: vi.fn((_name, options) => options.callback()) };
    const connection = new Connection(config);
    const ready = connection.prepare();
    const scripts = [...document.querySelectorAll('script')];
    expect(scripts).toHaveLength(2);
    scripts.forEach((script) => script.dispatchEvent(new Event('load')));
    await ready;
    await connection.prepare();
    expect(document.querySelectorAll('script')).toHaveLength(2);
    expect(window.gapi.load).toHaveBeenCalledWith('picker', expect.any(Object));
  });
  it('reports script download failure and permits retry', async () => {
    vi.resetModules();
    const { GoogleConnection: Connection } = await import('../../src/adapters/drive/google');
    const ready = new Connection(config).prepare();
    const check = expect(ready).rejects.toThrow(/네트워크/);
    document
      .querySelectorAll('script')
      .forEach((script) => script.dispatchEvent(new Event('error')));
    await check;
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
  it('times out stalled scripts instead of waiting indefinitely', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { GoogleConnection: Connection } = await import('../../src/adapters/drive/google');
    const ready = new Connection(config).prepare();
    const check = expect(ready).rejects.toThrow(/초과/);
    await vi.advanceTimersByTimeAsync(15000);
    await check;
  });
  it.each(['onerror', 'ontimeout'] as const)('reports Picker %s', async (callback) => {
    vi.resetModules();
    const { GoogleConnection: Connection } = await import('../../src/adapters/drive/google');
    window.gapi = { load: vi.fn((_name, options) => options[callback]()) };
    const ready = new Connection(config).prepare();
    const check = expect(ready).rejects.toThrow(/Picker/);
    document
      .querySelectorAll('script')
      .forEach((script) => script.dispatchEvent(new Event('load')));
    await check;
  });
});
