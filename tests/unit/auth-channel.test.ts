// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { GoogleConnection, type AuthEvent } from '../../src/adapters/drive/google';
import {
  openAuthChannel,
  parseAuthMessage,
  type AuthChannel,
  type AuthMessage,
} from '../../src/adapters/drive/auth-channel';

const config = { clientId: 'tab-client', apiKey: 'key', appId: 'project' };
// Delivers like BroadcastChannel: asynchronously, to every other tab, never back to the sender.
function hub() {
  const tabs = new Set<{ receive(message: AuthMessage): void }>();
  return (): AuthChannel => {
    const tab: { receive(message: AuthMessage): void } = { receive: () => {} };
    tabs.add(tab);
    return {
      post: (message) =>
        tabs.forEach(
          (other) => other !== tab && queueMicrotask(() => other.receive(structuredClone(message))),
        ),
      listen: (receive) => {
        tab.receive = receive;
      },
    };
  };
}
const settle = async () => {
  for (let hop = 0; hop < 4; hop++) await Promise.resolve();
};
function sdk(token = 'shared-token') {
  const request = vi.fn();
  const revoke = vi.fn((_token, callback) => callback({ successful: true }));
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options: { callback(value: object): void }) => ({
          requestAccessToken: () => {
            request();
            options.callback({ access_token: token, expires_in: 3600 });
          },
        }),
        revoke,
      },
    },
  } as unknown as NonNullable<typeof window.google>;
  return { request, revoke };
}
function tab(channel: AuthChannel) {
  const connection = new GoogleConnection(config, channel);
  const events: AuthEvent[] = [];
  connection.subscribe((event) => events.push(event));
  return { connection, events };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  delete window.google;
});

it('hands the in-memory token to a tab opened later without authorizing again', async () => {
  const join = hub();
  const { request } = sdk();
  const first = tab(join());
  await settle();
  await first.connection.connect();
  await settle();
  const second = tab(join());
  await settle();
  expect(second.connection.getToken()).toBe('shared-token');
  expect(second.events).toEqual(['connected']);
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('shared-token');
});

it('announces a new connection to tabs that were waiting for one', async () => {
  const join = hub();
  sdk();
  const waiting = tab(join());
  await settle();
  const first = tab(join());
  await settle();
  await first.connection.connect();
  await settle();
  expect(waiting.connection.getToken()).toBe('shared-token');
  expect(waiting.events).toEqual(['connected']);
});

it('keeps the remaining lifetime instead of extending it', async () => {
  vi.useFakeTimers();
  const join = hub();
  sdk();
  const first = tab(join());
  await settle();
  await first.connection.connect();
  await settle();
  vi.advanceTimersByTime(3000_000);
  const second = tab(join());
  await settle();
  expect(second.connection.getToken()).toBe('shared-token');
  vi.advanceTimersByTime(570_000);
  expect(first.connection.getToken()).toBeNull();
  expect(second.connection.getToken()).toBeNull();
});

it('clears a rejected token in every tab but keeps a newer one', async () => {
  const join = hub();
  sdk('old-token');
  const first = tab(join());
  await settle();
  await first.connection.connect();
  await settle();
  const second = tab(join());
  await settle();
  first.connection.clearToken();
  await settle();
  expect(second.connection.getToken()).toBeNull();
  expect(second.events).toEqual(['connected', 'expired']);
  sdk('new-token');
  await second.connection.connect();
  await settle();
  expect(first.connection.getToken()).toBe('new-token');
  // A late report about the replaced token must not drop the current one.
  join().post({ type: 'expired', token: 'old-token' });
  await settle();
  expect(second.connection.getToken()).toBe('new-token');
  expect(first.connection.getToken()).toBe('new-token');
});

it('disconnects every tab and revokes only once', async () => {
  const join = hub();
  const { revoke } = sdk();
  const first = tab(join());
  await settle();
  await first.connection.connect();
  await settle();
  const second = tab(join());
  await settle();
  await first.connection.disconnect();
  await settle();
  expect(second.connection.getToken()).toBeNull();
  expect(second.events).toEqual(['connected', 'disconnected']);
  expect(revoke).toHaveBeenCalledOnce();
  expect(first.events).toEqual([]);
});

it('does not let a remote disconnect be undone by a pending OAuth callback', async () => {
  const join = hub();
  sdk();
  let done!: (result: object) => void;
  window.google!.accounts.oauth2.initTokenClient = (options) => {
    done = options.callback;
    return { requestAccessToken: () => {} };
  };
  const first = tab(join());
  await settle();
  const second = tab(join());
  await settle();
  const pending = second.connection.connect();
  await first.connection.disconnect();
  await settle();
  const check = expect(pending).rejects.toThrow(/^drive\.\w+Cancelled$/);
  done({ access_token: 'too-late', expires_in: 3600 });
  await check;
  expect(second.connection.getToken()).toBeNull();
});

it('accepts only well-formed messages', () => {
  expect(parseAuthMessage({ type: 'request' })).toEqual({ type: 'request' });
  expect(parseAuthMessage({ type: 'disconnected', extra: 1 })).toEqual({ type: 'disconnected' });
  expect(parseAuthMessage({ type: 'expired', token: 't' })).toEqual({
    type: 'expired',
    token: 't',
  });
  expect(parseAuthMessage({ type: 'token', token: 't', expiresIn: 10 })).toEqual({
    type: 'token',
    token: 't',
    expiresIn: 10,
  });
  for (const value of [
    null,
    'request',
    { type: 'token', token: 't', expiresIn: 0 },
    { type: 'token', token: 't', expiresIn: Infinity },
    { type: 'token', token: '', expiresIn: 10 },
    { type: 'token', token: 't', expiresIn: '10' },
    { type: 'expired' },
    { type: 'unknown' },
  ])
    expect(parseAuthMessage(value)).toBeNull();
});

it('falls back to per-tab authorization without BroadcastChannel', () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  expect(openAuthChannel('tab-client')).toBeNull();
  vi.stubGlobal('BroadcastChannel', function () {
    throw new Error('Blocked');
  });
  expect(openAuthChannel('tab-client')).toBeNull();
  vi.unstubAllGlobals();
});

it('posts and parses through a real BroadcastChannel', async () => {
  const sender = openAuthChannel('real-client')!;
  const receiver = openAuthChannel('real-client')!;
  const received = new Promise<AuthMessage>((resolve) => receiver.listen(resolve));
  sender.post({ type: 'request' });
  await expect(received).resolves.toEqual({ type: 'request' });
});
