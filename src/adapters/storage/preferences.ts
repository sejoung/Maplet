import { isOneOf } from '../../domain/util/guards';
import { THEMES, type Preferences } from '../../domain/preferences';
import { HIGHLIGHT_COLORS } from '../../domain/rich-text/rich-text';
import { createStore, type Store } from '../../domain/util/store';
import { readItem, writeItem } from './web-storage';

export const PREFERENCE_KEYS = {
  theme: 'maplet:theme',
  highlight: 'maplet:highlight-color',
  minimap: 'maplet:minimap',
} as const;

const stored = (preferences: Preferences): Record<keyof Preferences, string> => ({
  theme: preferences.theme,
  highlight: preferences.highlight,
  minimap: preferences.minimap ? 'on' : 'off',
});

export function readPreferences(): Preferences {
  const theme = readItem('local', PREFERENCE_KEYS.theme);
  const highlight = readItem('local', PREFERENCE_KEYS.highlight);
  return {
    theme: isOneOf(THEMES, theme) ? theme : 'system',
    highlight: isOneOf(HIGHLIGHT_COLORS, highlight) ? highlight : 'yellow',
    minimap: readItem('local', PREFERENCE_KEYS.minimap) !== 'off',
  };
}

/** Preferences kept in this browser: read once, and each changed choice written back. */
export function storedPreferences(): Store<Preferences> {
  const store = createStore(readPreferences());
  let saved = stored(store.get());
  store.subscribe(() => {
    const next = stored(store.get());
    for (const key of Object.keys(next) as (keyof Preferences)[])
      if (next[key] !== saved[key]) writeItem('local', PREFERENCE_KEYS[key], next[key]);
    saved = next;
  });
  return store;
}
