// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  draftKey,
  draftOwner,
  openNewMapTab,
  startTab,
} from '../../src/adapters/storage/tab-session';

// Holds locks like the browser: exclusive per name, released only by `release`.
function lockManager() {
  const held = new Map<string, () => void>();
  const waiting = new Map<string, (() => void)[]>();
  const grant = (name: string, callback: LockGrantedCallback<unknown>) => {
    held.set(name, () => {
      held.delete(name);
      waiting.get(name)?.shift()?.();
    });
    void callback({ name, mode: 'exclusive' } as Lock);
  };
  const locks = {
    request: vi.fn(
      (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) =>
        new Promise<unknown>((_resolve, reject) => {
          if (!held.has(name)) return grant(name, callback);
          if (options.ifAvailable) return void callback(null);
          const queue = waiting.get(name) ?? [];
          queue.push(() => grant(name, callback));
          waiting.set(name, queue);
          if (options.signal?.aborted) return reject(options.signal.reason);
          options.signal?.addEventListener('abort', () => reject(options.signal!.reason));
        }),
    ),
    query: vi.fn(async () => ({
      held: [...held.keys()].map((name) => ({ name, mode: 'exclusive' as const })),
      pending: [],
    })),
  } as unknown as LockManager;
  return { locks, release: (name: string) => held.get(name)?.() };
}
afterEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

it('starts a new tab with its own ID and lists the other open tabs', async () => {
  const { locks } = lockManager();
  const first = await startTab(locks);
  sessionStorage.clear();
  const second = await startTab(locks);
  expect(second.id).not.toBe(first.id);
  expect(second).toMatchObject({ reopened: false, newMap: null });
  expect([...second.live]).toEqual([first.id]);
  expect(sessionStorage.getItem('maplet:tab')).toBe(second.id);
});

it('keeps the ID after a reload once the closing page releases it', async () => {
  const { locks, release } = lockManager();
  const before = await startTab(locks);
  const reloading = startTab(locks);
  release(`maplet:tab:${before.id}`);
  const after = await reloading;
  expect(after).toMatchObject({ id: before.id, reopened: true });
  expect(after.live.size).toBe(0);
});

it('gives a duplicated tab a new ID while the original stays open', async () => {
  const { locks } = lockManager();
  const original = await startTab(locks);
  // The reload grace period runs out while the original tab keeps its lock.
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
  const copy = await startTab(locks);
  expect(timeout).toHaveBeenCalledWith(1000);
  expect(copy.id).not.toBe(original.id);
  expect(copy.reopened).toBe(false);
  expect(copy.live.has(original.id)).toBe(true);
});

it('reads the requested title once and never reuses an inherited ID for a new map', async () => {
  const { locks } = lockManager();
  sessionStorage.setItem('maplet:tab', 'inherited');
  history.replaceState(null, '', `/Maplet/?lang=ko#new=${encodeURIComponent('업무 #1 / 계획')}`);
  const tab = await startTab(locks);
  expect(tab.newMap).toBe('업무 #1 / 계획');
  expect(tab.id).not.toBe('inherited');
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(
    '/Maplet/?lang=ko',
  );
  history.replaceState(null, '', '/#new=%E0%A4%A');
  expect((await startTab(locks)).newMap).toBe('%E0%A4%A');
});

it('treats a remembered ID as this tab without Web Locks', async () => {
  sessionStorage.setItem('maplet:tab', 'remembered');
  expect(await startTab(undefined)).toMatchObject({ id: 'remembered', reopened: true });
  sessionStorage.clear();
  const fresh = await startTab(undefined);
  expect(fresh.reopened).toBe(false);
  expect(fresh.live.size).toBe(0);
});

it('still starts when session storage and the lock list are unavailable', async () => {
  const { locks } = lockManager();
  vi.mocked(locks.query).mockRejectedValue(new Error('blocked'));
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const tab = await startTab(locks);
  expect(tab.reopened).toBe(false);
  expect(tab.live.size).toBe(0);
});

it('opens a new map tab without sharing this tab and keeps the title out of the request', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  history.replaceState(null, '', '/Maplet/?lang=en');
  openNewMapTab('Plan & Ideas');
  expect(open).toHaveBeenCalledWith(
    '/Maplet/?lang=en#new=Plan%20%26%20Ideas',
    '_blank',
    'noopener',
  );
});

it('maps draft keys to their tab', () => {
  expect(draftKey('abc')).toBe('tab:abc');
  expect(draftOwner('tab:abc')).toBe('abc');
  expect(draftOwner('current')).toBeNull();
});
