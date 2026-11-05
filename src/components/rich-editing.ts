import type { KeyboardEvent } from 'react';
import {
  formatRange,
  rangeFormat,
  runsText,
  wordAt,
  type HighlightColor,
  type TextRun,
} from '../domain/rich-text';
import type { TextSelection } from './rich-dom';

export interface EditorState {
  runs: TextRun[];
  selection: TextSelection;
}
export type FormatCommand =
  { kind: 'bold' } | { kind: 'highlight'; color: HighlightColor } | { kind: 'clear' };

let lastHighlight: HighlightColor = 'yellow';
/** The color the highlight shortcut uses: the one last chosen from the menu. */
export const lastHighlightColor = () => lastHighlight;

const ordered = ({ start, end }: TextSelection) => ({
  start: Math.min(start, end),
  end: Math.max(start, end),
});

/** Apply a command to the selection, or the word at the caret when nothing is selected. */
export function runCommand(state: EditorState, command: FormatCommand): EditorState | null {
  let { start, end } = ordered(state.selection);
  if (start === end) {
    const word = wordAt(runsText(state.runs), start);
    if (!word) return null;
    [start, end] = word;
  }
  const current = rangeFormat(state.runs, start, end);
  let patch;
  if (command.kind === 'bold') patch = { bold: current.bold !== true };
  else if (command.kind === 'clear') patch = { bold: false, highlight: null };
  else {
    lastHighlight = command.color;
    // Choosing the color that is already there takes it off again.
    patch = { highlight: current.highlight === command.color ? null : command.color };
  }
  return { runs: formatRange(state.runs, start, end, patch), selection: { start, end } };
}

/** ⌘/Ctrl+B bold, ⌘/Ctrl+Shift+H last highlighter color, ⌘/Ctrl+\ clear. */
export function formatShortcut(event: KeyboardEvent): FormatCommand | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  // A Korean or other non-Latin layout reports its own character; the physical key decides.
  const is = (letter: string, code: string) =>
    key === letter || (!/^[ -~]$/.test(key) && event.code === code);
  if (!event.shiftKey && is('b', 'KeyB')) return { kind: 'bold' };
  if (event.shiftKey && is('h', 'KeyH')) return { kind: 'highlight', color: lastHighlight };
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
