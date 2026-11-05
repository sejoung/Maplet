import type { KeyboardEvent } from 'react';
import {
  commandPatch,
  formatRange,
  rangeFormat,
  runsText,
  wordAt,
  type FormatCommand,
  type TextRun,
} from '../domain/rich-text';
import type { TextSelection } from './rich-dom';
import { highlightColor, setHighlightColor } from './highlight-color';

export type { FormatCommand };
export interface EditorState {
  runs: TextRun[];
  selection: TextSelection;
}

const ordered = ({ start, end }: TextSelection) => ({
  start: Math.min(start, end),
  end: Math.max(start, end),
});

/** The text a command acts on: the selection, or the word at the caret. */
export function commandRange(state: EditorState): TextSelection | null {
  const { start, end } = ordered(state.selection);
  if (start !== end) return { start, end };
  const word = wordAt(runsText(state.runs), start);
  return word ? { start: word[0], end: word[1] } : null;
}

/** Apply a command to the selection, or the word at the caret when nothing is selected. */
export function runCommand(state: EditorState, command: FormatCommand): EditorState | null {
  const range = commandRange(state);
  if (!range) return null;
  // Choosing a color anywhere makes it the shared highlighter color.
  if (command.kind === 'highlight') setHighlightColor(command.color);
  const patch = commandPatch(command, rangeFormat(state.runs, range.start, range.end));
  return { runs: formatRange(state.runs, range.start, range.end, patch), selection: range };
}

/**
 * ⌘/Ctrl+B bold, ⌘/Ctrl+I italic, ⌘/Ctrl+Shift+H the shared highlighter color and
 * ⌘/Ctrl+\ clear. Used both while editing a title and on selected nodes.
 */
export function formatShortcut(
  event: KeyboardEvent | globalThis.KeyboardEvent,
): FormatCommand | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  // A Korean or other non-Latin layout reports its own character; the physical key decides.
  const is = (letter: string, code: string) =>
    key === letter || (!/^[ -~]$/.test(key) && event.code === code);
  if (!event.shiftKey && is('b', 'KeyB')) return { kind: 'bold' };
  if (!event.shiftKey && is('i', 'KeyI')) return { kind: 'italic' };
  if (event.shiftKey && is('h', 'KeyH')) return { kind: 'highlight', color: highlightColor() };
  if (!event.shiftKey && is('\\', 'Backslash')) return { kind: 'clear' };
  return null;
}

export function historyShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' || (key.length === 1 && !/[ -~]/.test(key) && event.code === 'KeyZ'))
    return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' || event.code === 'KeyY') return 'redo';
  return null;
}

/**
 * Undo inside one editing session. The editor redraws its DOM for formatting, which the
 * browser's own undo cannot follow, so typing is grouped here too.
 */
export class EditHistory {
  private past: EditorState[] = [];
  private future: EditorState[] = [];
  private lastKind = '';
  private lastTime = 0;

  /** Remember `before`, merging quick runs of the same kind of typing into one step. */
  record(before: EditorState, kind: string, now = Date.now()) {
    if (kind === 'format' || kind !== this.lastKind || now - this.lastTime > 1000) {
      this.past.push(before);
      if (this.past.length > 200) this.past.shift();
    }
    this.future = [];
    this.lastKind = kind;
    this.lastTime = now;
  }

  undo(current: EditorState) {
    const previous = this.past.pop();
    if (previous) this.future.push(current);
    this.lastKind = '';
    return previous ?? null;
  }

  redo(current: EditorState) {
    const next = this.future.pop();
    if (next) this.past.push(current);
    this.lastKind = '';
    return next ?? null;
  }
}
