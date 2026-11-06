// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  PREFERENCE_KEYS,
  readPreferences,
  storedPreferences,
} from '../../src/adapters/storage/preferences';
import { showTheme, startPageTheme } from '../../src/adapters/page-theme';
import { DEFAULT_PREFERENCES } from '../../src/domain/preferences';
import { createStore } from '../../src/domain/store';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it('reads defaults for missing or unknown values', () => {
  expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  localStorage.setItem(PREFERENCE_KEYS.theme, 'sepia');
  localStorage.setItem(PREFERENCE_KEYS.highlight, 'orange');
  localStorage.setItem(PREFERENCE_KEYS.minimap, 'maybe');
  expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
});

it('restores saved choices and writes back only what changed', () => {
  localStorage.setItem(PREFERENCE_KEYS.theme, 'dark');
  localStorage.setItem(PREFERENCE_KEYS.minimap, 'off');
  const store = storedPreferences();
  expect(store.get()).toEqual({ theme: 'dark', highlight: 'yellow', minimap: false });
  store.set({ ...store.get(), highlight: 'blue', minimap: true });
  expect(localStorage.getItem(PREFERENCE_KEYS.highlight)).toBe('blue');
  expect(localStorage.getItem(PREFERENCE_KEYS.minimap)).toBe('on');
  localStorage.removeItem(PREFERENCE_KEYS.theme);
  store.set({ ...store.get(), minimap: false });
  // The unchanged theme is not written again.
  expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBeNull();
  expect(storedPreferences().get()).toMatchObject({ highlight: 'blue', minimap: false });
});

it('shows the chosen theme on the page and follows changes', () => {
  showTheme('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  const store = createStore(DEFAULT_PREFERENCES);
  const stop = startPageTheme(store);
  expect(document.documentElement.dataset.theme).toBeUndefined();
  store.set({ ...store.get(), theme: 'dark' });
  expect(document.documentElement.dataset.theme).toBe('dark');
  stop();
  store.set({ ...store.get(), theme: 'light' });
  expect(document.documentElement.dataset.theme).toBe('dark');
});
