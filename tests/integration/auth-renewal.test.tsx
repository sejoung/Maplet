// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { GoogleConnection, RENEW_BEFORE } from '../../src/adapters/drive/google';
import type { AuthChannel, AuthMessage } from '../../src/adapters/drive/auth-channel';
import { useAuthRenewal } from '../../src/app/useAuthRenewal';

const config = { clientId: 'renewal-client', apiKey: 'key', appId: 'project' };
const untilRenewal = 3570000 - RENEW_BEFORE;
let outcome: 'grant' | 'close' = 'grant';
let request = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  outcome = 'grant';
  request = vi.fn();
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options: { callback(value: object): void; error_callback(): void }) => ({
          requestAccessToken: () => {
            request();
            if (outcome === 'grant')
              options.callback({
                access_token: `token-${request.mock.calls.length}`,
                expires_in: 3600,
              });
            else options.error_callback();
          },
        }),
        revoke: vi.fn(),
      },
    },
  } as unknown as NonNullable<typeof window.google>;
});
afterEach(() => {
  vi.useRealTimers();
  delete window.google;
});

async function setup(active = true, channel: AuthChannel | null = null) {
  const google = new GoogleConnection(config, channel);
  await google.connect();
  request.mockClear();
  const setNotice = vi.fn();
  const hook = renderHook(({ on }) => useAuthRenewal(google, on, setNotice), {
    initialProps: { on: active },
  });
  return { google, setNotice, hook };
}
const click = (target: Element = document.body) => act(async () => void fireEvent.click(target));

it('leaves clicks alone until the renewal window opens', async () => {
  const { hook } = await setup();
  await click();
  expect(request).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  expect(hook.result.current.expiring).toBe(true);
});

it('renews on the next click and ignores keyboard input', async () => {
  const { google, hook } = await setup();
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  await act(async () => void fireEvent.keyDown(document.body, { key: 'a' }));
  expect(request).not.toHaveBeenCalled();
  await click();
  expect(request).toHaveBeenCalledOnce();
  expect(google.getToken()).toBe('token-1');
  expect(hook.result.current.expiring).toBe(false);
  await click();
  expect(request).toHaveBeenCalledOnce();
});

it('stops reopening a closed popup on every click but keeps the explicit renewal', async () => {
  const { setNotice, hook } = await setup();
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  outcome = 'close';
  await click();
  await click();
  expect(request).toHaveBeenCalledOnce();
  expect(setNotice).not.toHaveBeenCalled();
  await act(() => hook.result.current.renew());
  expect(request).toHaveBeenCalledTimes(2);
  expect(setNotice).toHaveBeenCalledWith('drive.googleSignWindowClosedBlocked');
  expect(hook.result.current.expiring).toBe(true);
  outcome = 'grant';
  await act(() => hook.result.current.renew());
  expect(hook.result.current.expiring).toBe(false);
});

it('lets the header button report its own result instead of the click listener', async () => {
  const { hook } = await setup();
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  const button = document.createElement('button');
  button.className = 'drive-renew';
  document.body.append(button);
  await click(button);
  expect(request).not.toHaveBeenCalled();
  await act(() => hook.result.current.renew());
  expect(request).toHaveBeenCalledOnce();
  button.remove();
});

it('does not renew while Drive work is running or after the token expired', async () => {
  const { hook } = await setup(false);
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  await click();
  expect(request).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(RENEW_BEFORE));
  expect(hook.result.current.expiring).toBe(false);
  hook.rerender({ on: true });
  await click();
  await act(() => hook.result.current.renew());
  expect(request).not.toHaveBeenCalled();
});

it('clears the warning when another tab renews', async () => {
  let receive!: (message: AuthMessage) => void;
  const channel: AuthChannel = { post: () => {}, listen: (listener) => (receive = listener) };
  const { google, hook } = await setup(true, channel);
  await act(() => vi.advanceTimersByTimeAsync(untilRenewal));
  expect(hook.result.current.expiring).toBe(true);
  act(() => receive({ type: 'token', token: 'from-other-tab', expiresIn: 3570000 }));
  expect(hook.result.current.expiring).toBe(false);
  expect(google.getToken()).toBe('from-other-tab');
  await click();
  expect(request).not.toHaveBeenCalled();
});
