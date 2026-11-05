import { useSyncExternalStore } from 'react';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../domain/rich-text';

/**
 * The highlighter color shared by the toolbar, the text menu and the shortcut, for every
 * node. It is a preference of this browser, not part of any document.
 */
const KEY = 'maplet:highlight-color';
export const HIGHLIGHT_LABELS: Record<HighlightColor, string> = {
  yellow: 'format.yellow',
  green: 'format.green',
  blue: 'format.blue',
  pink: 'format.pink',
};
const listeners = new Set<() => void>();

function read(): HighlightColor {
  try {
    const saved = localStorage.getItem(KEY);
    return HIGHLIGHT_COLORS.includes(saved as HighlightColor)
      ? (saved as HighlightColor)
      : 'yellow';
  } catch {
    return 'yellow';
  }
}
let current = read();

export const highlightColor = () => current;

export function setHighlightColor(color: HighlightColor) {
  current = color;
  try {
    localStorage.setItem(KEY, color);
  } catch {
    // The choice still applies until the page is closed.
  }
  listeners.forEach((listener) => listener());
}

export function useHighlightColor() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    highlightColor,
    highlightColor,
  );
}
