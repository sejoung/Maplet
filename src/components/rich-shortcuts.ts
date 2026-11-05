import type { KeyboardEvent } from 'react';
import { clearFormatting, cycleHighlight, toggleBold, type RichEdit } from '../domain/rich-text';

export type RichFormat = (raw: string, start: number, end: number) => RichEdit | null;

/** ⌘/Ctrl+B bold, ⌘/Ctrl+Shift+H next highlighter color, ⌘/Ctrl+\ clear. */
export function richShortcut(event: KeyboardEvent): RichFormat | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  // A Korean or other non-Latin layout reports its own character; the physical key decides.
  const is = (letter: string, code: string) =>
    key === letter || (!/^[ -~]$/.test(key) && event.code === code);
  if (!event.shiftKey && is('b', 'KeyB')) return toggleBold;
  if (event.shiftKey && is('h', 'KeyH')) return cycleHighlight;
  if (!event.shiftKey && is('\\', 'Backslash')) return clearFormatting;
  return null;
}

/**
 * Replace only the changed middle of the textarea so native undo keeps working; fall back
 * to setting the value where the browser has no editing command.
 */
export function applyRichFormat(
  input: HTMLTextAreaElement,
  format: RichFormat,
  fallback: (value: string) => void,
) {
  const before = input.value;
  const edit = format(before, input.selectionStart, input.selectionEnd);
  if (!edit) return;
  if (edit.value !== before) {
    let prefix = 0;
    while (prefix < before.length && before[prefix] === edit.value[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < edit.value.length - prefix &&
      before.at(-1 - suffix) === edit.value.at(-1 - suffix)
    )
      suffix++;
    const inserted = edit.value.slice(prefix, edit.value.length - suffix);
    input.setSelectionRange(prefix, before.length - suffix);
    let done = false;
    try {
      done =
        typeof document.execCommand === 'function' &&
        document.execCommand(inserted ? 'insertText' : 'delete', false, inserted);
    } catch {
      done = false;
    }
    if (!done || input.value !== edit.value) {
      input.value = edit.value;
      fallback(edit.value);
    }
  }
  input.setSelectionRange(edit.start, edit.end);
}
