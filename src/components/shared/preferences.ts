import { createContext, useCallback, useContext } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '../../domain/preferences';
import { createStore, type Store } from '../../domain/util/store';
import { useStore } from './useStore';

/**
 * This browser's preferences. The composition root provides a persisted store; without one
 * (tests, previews) choices last for the page.
 */
export const PreferencesContext = createContext<Store<Preferences>>(
  createStore(DEFAULT_PREFERENCES),
);

export function usePreferences() {
  const store = useContext(PreferencesContext);
  const preferences = useStore(store);
  const update = useCallback(
    (patch: Partial<Preferences>) => store.set({ ...store.get(), ...patch }),
    [store],
  );
  return [preferences, update] as const;
}
