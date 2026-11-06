import type { KeyboardEvent } from 'react';
import type { FormatCommand, HighlightColor } from '../../domain/rich-text/rich-text';

type Keys = KeyboardEvent | globalThis.KeyboardEvent;

/**
 * ⌘/Ctrl+B bold, ⌘/Ctrl+I italic, ⌘/Ctrl+Shift+H the shared highlighter color and
 * ⌘/Ctrl+\ clear. Used both while editing a title and on selected nodes.
 */
export function formatShortcut(event: Keys, highlight: HighlightColor): FormatCommand | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  // A Korean or other non-Latin layout reports its own character; the physical key decides.
  const is = (letter: string, code: string) =>
    key === letter || (!/^[ -~]$/.test(key) && event.code === code);
  if (!event.shiftKey && is('b', 'KeyB')) return { kind: 'bold' };
  if (!event.shiftKey && is('i', 'KeyI')) return { kind: 'italic' };
  if (event.shiftKey && is('h', 'KeyH')) return { kind: 'highlight', color: highlight };
  if (!event.shiftKey && is('\\', 'Backslash')) return { kind: 'clear' };
  return null;
}

export function historyShortcut(event: Keys): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' || (key.length === 1 && !/[ -~]/.test(key) && event.code === 'KeyZ'))
    return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' || event.code === 'KeyY') return 'redo';
  return null;
}

/** What an unmodified key does in the title editor. */
export type TitleKey = 'menu' | 'escape' | 'newline' | 'commit' | 'next';

export function titleKey(event: Keys): TitleKey | null {
  if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') return 'menu';
  if (event.key === 'Escape') return 'escape';
  if (event.key === 'Enter') return event.shiftKey ? 'newline' : 'commit';
  if (event.key === 'Tab' && !event.shiftKey) return 'next';
  return null;
}
