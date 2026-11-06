import {
  commandPatch,
  formatRange,
  rangeFormat,
  runsText,
  wordAt,
  type FormatCommand,
  type TextRun,
} from './rich-text';

/** Plain-text position of a selection inside a title, in UTF-16 units; `end` may come first. */
export interface TextSelection {
  start: number;
  end: number;
}
/** A title being edited: its formatted text and where the selection is. */
export interface EditorState {
  runs: TextRun[];
  selection: TextSelection;
}

/** The selection with `start` before `end`, however it was made. */
export const ordered = ({ start, end }: TextSelection): TextSelection => ({
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
  const patch = commandPatch(command, rangeFormat(state.runs, range.start, range.end));
  return { runs: formatRange(state.runs, range.start, range.end, patch), selection: range };
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

  /** Step back or forward; null when there is nothing to step to. */
  step(direction: 'undo' | 'redo', current: EditorState) {
    return direction === 'undo' ? this.undo(current) : this.redo(current);
  }
}
