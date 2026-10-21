export type Theme = 'system' | 'light' | 'dark';
const KEY = 'maplet:theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** `system` follows the operating system through CSS; the others pin the palette. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // The theme still applies until the page is closed.
  }
  applyTheme(theme);
}
