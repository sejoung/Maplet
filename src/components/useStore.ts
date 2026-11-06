import { useSyncExternalStore } from 'react';
import type { Store } from '../domain/store';

/** The store's value, re-rendering when it is replaced. */
export const useStore = <T>(store: Store<T>): T =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
