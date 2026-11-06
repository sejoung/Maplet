/**
 * One observable value: read it, replace it, hear about replacements. Shaped for React's
 * `useSyncExternalStore`, but free of React so adapters can persist what it holds.
 */
export interface Store<T> {
  get(): T;
  /** Replace the value; listeners run unless it is the same value. */
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
