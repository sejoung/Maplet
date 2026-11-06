import type { Preferences, Theme } from '../domain/preferences';
import type { Store } from '../domain/util/store';

/** `system` leaves the palette to the operating system through CSS; the others pin it. */
export function showTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Show the chosen theme now and on every change. Returns the unsubscribe for tests. */
export function startPageTheme(preferences: Store<Preferences>): () => void {
  showTheme(preferences.get().theme);
  return preferences.subscribe(() => showTheme(preferences.get().theme));
}
