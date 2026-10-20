// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { GoogleConnection } from '../../src/adapters/drive/google';

const config = { clientId: 'session-client', apiKey: 'key', appId: 'project' };
const key = 'maplet:drive-session:session-client';
function sdk() {
  const request = vi.fn();
  const revoke = vi.fn((_token, callback) => callback({ successful: true }));
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options: { callback(value: object): void }) => ({
          requestAccessToken: () => {
            request();
            options.callback({ access_token: 'memory-token', expires_in: 3600 });
          },
        }),
        revoke,
      },
    },
  } as unknown as NonNullable<typeof window.google>;
  return { request, revoke };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
  delete window.google;
  document.querySelectorAll('script[src^="https://"]').forEach((script) => script.remove());
});

it('keeps authentication only in memory and requires authorization after recreation', async () => {
  const { request } = sdk();
  const first = new GoogleConnection(config);
  await first.connect();
  expect(first.getToken()).toBe('memory-token');
  delete window.google;
  expect(new GoogleConnection(config).getToken()).toBeNull();
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.stringify(localStorage)).not.toContain('memory-token');
  expect(JSON.stringify(sessionStorage)).not.toContain('memory-token');
});

it('deletes all legacy credentials without restoring even a valid token', () => {
  for (const storage of [sessionStorage, localStorage]) {
    storage.setItem(key, JSON.stringify({ token: 'legacy', expiresAt: Date.now() + 3600000 }));
    storage.setItem('maplet:drive-session:old-client', 'broken');
    storage.setItem('maplet:drive-workspace:session-client', 'folder metadata');
  }
  expect(new GoogleConnection(config).getToken()).toBeNull();
  for (const storage of [sessionStorage, localStorage]) {
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem('maplet:drive-session:old-client')).toBeNull();
    expect(storage.getItem('maplet:drive-workspace:session-client')).toBe('folder metadata');
  }
});

it('expires authentication without silently renewing it', async () => {
  vi.useFakeTimers();
  const { request } = sdk();
  const connection = new GoogleConnection(config);
  await connection.connect();
  await vi.advanceTimersByTimeAsync(3570000);
  expect(connection.getToken()).toBeNull();
  expect(request).toHaveBeenCalledOnce();
});

it('clears rejected authentication without revoking unrelated consent', async () => {
  const { revoke } = sdk();
  const connection = new GoogleConnection(config);
  await connection.connect();
  connection.clearToken();
  expect(connection.getToken()).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
});

it('clears local authentication immediately while waiting for confirmed revocation', async () => {
  const { revoke } = sdk();
  let done!: (result: { successful: boolean }) => void;
  revoke.mockImplementation((_token, callback) => {
    done = callback;
  });
  const connection = new GoogleConnection(config);
  await connection.connect();
  const pending = connection.disconnect();
  expect(connection.getToken()).toBeNull();
  expect(revoke).toHaveBeenCalledWith('memory-token', expect.any(Function));
  done({ successful: true });
  await pending;
});

it('loads Identity Services to revoke when the SDK is missing', async () => {
  vi.resetModules();
  const { GoogleConnection: Connection } = await import('../../src/adapters/drive/google');
  sdk();
  const connection = new Connection(config);
  await connection.connect();
  delete window.google;
  const pending = connection.disconnect();
  expect(connection.getToken()).toBeNull();
  const script = document.querySelector<HTMLScriptElement>('script')!;
  expect(script.src).toBe('https://accounts.google.com/gsi/client');
  const { revoke } = sdk();
  script.dispatchEvent(new Event('load'));
  await pending;
  expect(revoke).toHaveBeenCalledWith('memory-token', expect.any(Function));
});

it.each(['failure', 'timeout', 'throw'] as const)(
  'reports unconfirmed revocation: %s',
  async (mode) => {
    vi.useFakeTimers();
    const { revoke } = sdk();
    revoke.mockImplementation((_token, callback) => {
      if (mode === 'failure') callback({ successful: false });
      if (mode === 'throw') throw new Error('SDK unavailable');
    });
    const connection = new GoogleConnection(config);
    await connection.connect();
    const check = expect(connection.disconnect()).rejects.toThrow(/Google 권한/);
    expect(connection.getToken()).toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    await check;
  },
);

it('does not resurrect a connection from an OAuth callback received after disconnect', async () => {
  sdk();
  let done!: (result: object) => void;
  window.google!.accounts.oauth2.initTokenClient = (options) => {
    done = options.callback;
    return { requestAccessToken: () => {} };
  };
  const connection = new GoogleConnection(config);
  const pending = connection.connect();
  await connection.disconnect();
  const check = expect(pending).rejects.toThrow(/취소/);
  done({ access_token: 'too-late', expires_in: 3600 });
  await check;
  expect(connection.getToken()).toBeNull();
});

it('works when browser storage is blocked', async () => {
  sdk();
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new Error('Blocked');
  });
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('Blocked');
  });
  const connection = new GoogleConnection(config);
  await connection.connect();
  expect(connection.getToken()).toBe('memory-token');
  expect(new GoogleConnection(config).getToken()).toBeNull();
  await connection.disconnect();
  expect(connection.getToken()).toBeNull();
});
