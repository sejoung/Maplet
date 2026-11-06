import { describe, expect, it } from 'vitest';
import {
  EditHistory,
  commandRange,
  ordered,
  runCommand,
  type EditorState,
} from '../../src/domain/rich-editing';
import { formatRuns, richRuns } from '../../src/domain/rich-text';

const state = (title: string, start: number, end = start): EditorState => ({
  runs: richRuns(title),
  selection: { start, end },
});

describe('rich title editing', () => {
  it('orders a selection made backwards', () => {
    expect(ordered({ start: 5, end: 2 })).toEqual({ start: 2, end: 5 });
    expect(ordered({ start: 2, end: 5 })).toEqual({ start: 2, end: 5 });
  });

  it('acts on the selection, else on the word at the caret', () => {
    expect(commandRange(state('alpha beta', 8, 6))).toEqual({ start: 6, end: 8 });
    expect(commandRange(state('alpha beta', 7))).toEqual({ start: 6, end: 10 });
    expect(commandRange(state('a  b', 2))).toBeNull();
  });

  it('formats without side effects and selects what it formatted', () => {
    const next = runCommand(state('alpha beta', 7), { kind: 'highlight', color: 'green' })!;
    expect(formatRuns(next.runs)).toBe('alpha =={green}beta==');
    expect(next.selection).toEqual({ start: 6, end: 10 });
    expect(runCommand(state('a  b', 2), { kind: 'bold' })).toBeNull();
  });

  it('steps through history in both directions', () => {
    const history = new EditHistory();
    const first = state('a', 1);
    const second = state('ab', 2);
    history.record(first, 'format', 0);
    expect(history.step('undo', second)).toBe(first);
    expect(history.step('redo', first)).toBe(second);
    expect(history.step('redo', second)).toBeNull();
  });
});
