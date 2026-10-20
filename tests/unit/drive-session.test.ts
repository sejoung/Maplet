import { afterEach, expect, it, vi } from 'vitest';
import { GoogleConnection } from '../../src/adapters/drive/google';
import { readDriveSession } from '../../src/adapters/drive/session';

const config = { clientId: 'session-client', apiKey: 'key', appId: 'project' };
const key = 'maplet:drive-session:session-client';
function sdk() {
  const request = vi.fn();
  const revoke = vi.fn();
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options: { callback(value: object): void }) => ({
          requestAccessToken: () => {
            request();
            options.callback({ access_token: 'tab-session-token', expires_in: 3600 });
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
  delete window.google;
});

it('restores a valid connection after page recreation without SDK authorization', async () => {
  const { request } = sdk();
  const first = new GoogleConnection(config);
  await first.connect();
  expect(first.getToken()).toBe('tab-session-token');
  delete window.google;
  expect(new GoogleConnection(config).getToken()).toBe('tab-session-token');
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.stringify(localStorage)).not.toContain('tab-session-token');
});

it('does not reuse a session belonging to another Google client', async () => {
  sdk();
  await new GoogleConnection(config).connect();
  expect(new GoogleConnection({ ...config, clientId: 'other' }).getToken()).toBeNull();
  expect(new GoogleConnection(config).getToken()).toBe('tab-session-token');
});

it('expires cached authentication without extending its lifetime on reload', async () => {
  vi.useFakeTimers();
  const { request } = sdk();
  await new GoogleConnection(config).connect();
  const expiresAt = readDriveSession(config.clientId)!.expiresAt;
  vi.advanceTimersByTime(1000);
  const restored = new GoogleConnection(config);
  expect(readDriveSession(config.clientId)!.expiresAt).toBe(expiresAt);
  vi.advanceTimersByTime(3600_000);
  expect(restored.getToken()).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(new GoogleConnection(config).getToken()).toBeNull();
  expect(request).toHaveBeenCalledOnce();
});

it('clears the session after rejected authentication without revoking unrelated consent', async () => {
  const { revoke } = sdk();
  const connection = new GoogleConnection(config);
  await connection.connect();
  connection.clearToken();
  expect(new GoogleConnection(config).getToken()).toBeNull();
  expect(connection.getToken()).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
});

it('disconnects and clears the remembered session so reload cannot reconnect', async () => {
  const { revoke } = sdk();
  const connection = new GoogleConnection(config);
  await connection.connect();
  connection.disconnect();
  expect(revoke).toHaveBeenCalledWith('tab-session-token', expect.any(Function));
  expect(new GoogleConnection(config).getToken()).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});

it.each([
  '{broken',
  'null',
  '{}',
  '{"token":"fake","expiresAt":"later"}',
  '{"token":"fake","expiresAt":1}',
])('discards malformed or expired sessions: %s', (value) => {
  sessionStorage.setItem(key, value);
  expect(new GoogleConnection(config).getToken()).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});

it('keeps the current connection usable when session storage is unavailable', async () => {
  sdk();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  const connection = new GoogleConnection(config);
  await connection.connect();
  expect(connection.getToken()).toBe('tab-session-token');
  expect(new GoogleConnection(config).getToken()).toBeNull();
  connection.disconnect();
  expect(connection.getToken()).toBeNull();
});
