import { expect, it, vi } from 'vitest';
import { createStore } from '../../src/domain/store';

it('notifies subscribers of replaced values until they unsubscribe', () => {
  const store = createStore({ count: 0 });
  const listener = vi.fn();
  const stop = store.subscribe(listener);
  const next = { count: 1 };
  store.set(next);
  expect(store.get()).toBe(next);
  // The same value is no change.
  store.set(next);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  store.set({ count: 2 });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.get()).toEqual({ count: 2 });
});
