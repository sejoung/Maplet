import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  EditHistory,
  commandRange,
  ordered,
  runCommand,
  type EditorState,
} from '../../domain/rich-text/rich-editing';
import {
  formatRuns,
  rangeFormat,
  replaceRange,
  richRuns,
  runsText,
  type FormatCommand,
} from '../../domain/rich-text/rich-text';
import { readRuns, readSelection, renderRuns, writeSelection } from './rich-dom';
import { attachEditor, notifyEditor, useRichEditorBridge } from './rich-editor-bridge';
import { usePreferences } from '../shared/preferences';
import { useLatest } from '../shared/useLatest';

/**
 * The editing core of a formatted title in a contenteditable element: it reads and redraws
 * the DOM as runs, keeps its own undo history, waits for IME composition before formatting,
 * and lends itself to the toolbar while open.
 */
export function useRichTextEditor(
  input: RefObject<HTMLDivElement | null>,
  { title, onDraftChange }: { title: string; onDraftChange(title: string): void },
) {
  const history = useRef(new EditHistory());
  const composing = useRef(false);
  // A shortcut pressed mid-composition waits until the composed text is in place.
  const pendingFormat = useRef<FormatCommand | null>(null);
  const initialTitle = useRef(title);
  // The parent passes a new callback on every render; the editor must not reset for that.
  const draftChange = useLatest(onDraftChange);
  const bridge = useRichEditorBridge();
  const [, updatePreferences] = usePreferences();

  const state = useCallback((): EditorState => {
    const element = input.current!;
    const runs = readRuns(element);
    const end = runsText(runs).length;
    return { runs, selection: readSelection(element) ?? { start: end, end } };
  }, [input]);
  const changed = useCallback(
    (runs: EditorState['runs']) => {
      draftChange.current(formatRuns(runs));
      if (bridge) notifyEditor(bridge);
    },
    [draftChange, bridge],
  );
  const show = useCallback(
    (next: EditorState) => {
      const element = input.current!;
      renderRuns(element, next.runs);
      writeSelection(element, next.selection);
      changed(next.runs);
    },
    [input, changed],
  );
  const stepHistory = useCallback(
    (direction: 'undo' | 'redo') => {
      const restored = history.current.step(direction, state());
      if (restored) show(restored);
    },
    [state, show],
  );
  const apply = useCallback(
    (command: FormatCommand, from = state()) => {
      const next = runCommand(from, command);
      if (!next) return;
      // Choosing a color anywhere makes it the shared highlighter color.
      if (command.kind === 'highlight') updatePreferences({ highlight: command.color });
      history.current.record(from, 'format');
      show(next);
    },
    [state, show, updatePreferences],
  );
  const insertText = (text: string) => {
    const before = state();
    const { start, end } = ordered(before.selection);
    history.current.record(before, 'insert-text');
    const at = start + text.length;
    show({ runs: replaceRange(before.runs, start, end, text), selection: { start: at, end: at } });
  };

  // Draw the title once when editing starts; from then on the DOM holds the edit.
  useLayoutEffect(() => {
    const element = input.current!;
    const runs = richRuns(initialTitle.current);
    renderRuns(element, runs);
    element.focus({ preventScroll: true });
    writeSelection(element, { start: 0, end: runsText(runs).length });
  }, [input]);
  useLayoutEffect(() => {
    const element = input.current!;
    const beforeInput = (event: InputEvent) => {
      const kind = event.inputType;
      if (kind === 'historyUndo' || kind === 'historyRedo') {
        event.preventDefault();
        stepHistory(kind === 'historyUndo' ? 'undo' : 'redo');
      } else if (kind.startsWith('format') || kind === 'insertFromDrop' || kind === 'deleteByDrag')
        // Only our own commands format text, and dropped content could bring markup along.
        event.preventDefault();
      else if (kind !== 'insertCompositionText') history.current.record(state(), kind);
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [input, state, stepHistory]);

  // The toolbar formats this editor's selection while it is open.
  useEffect(() => {
    if (!bridge) return;
    attachEditor(bridge, {
      apply: (command) => apply(command),
      format: () => {
        if (!input.current) return null;
        const now = state();
        const range = commandRange(now);
        return range ? rangeFormat(now.runs, range.start, range.end) : null;
      },
    });
    const selectionChanged = () => notifyEditor(bridge);
    document.addEventListener('selectionchange', selectionChanged);
    return () => {
      document.removeEventListener('selectionchange', selectionChanged);
      attachEditor(bridge, null);
    };
  }, [bridge, input, state, apply]);

  const inputHandlers = useMemo(
    () => ({
      onInput(event: { currentTarget: HTMLDivElement }) {
        const element = event.currentTarget;
        const runs = readRuns(element);
        // Keep the empty last line visible after a deletion leaves a trailing break.
        const text = runsText(runs);
        const placeholder =
          element.lastChild instanceof HTMLElement &&
          element.lastChild.dataset.placeholder !== undefined;
        if (!composing.current && (!text || text.endsWith('\n')) !== placeholder) {
          const selection = readSelection(element);
          renderRuns(element, runs);
          if (selection) writeSelection(element, selection);
        }
        changed(runs);
      },
      onCompositionStart() {
        history.current.record(state(), 'compose');
        composing.current = true;
      },
      onCompositionEnd() {
        composing.current = false;
        const action = pendingFormat.current;
        pendingFormat.current = null;
        if (action) setTimeout(() => apply(action), 0);
      },
    }),
    [state, changed, apply],
  );

  return {
    /** The title as first shown, to tell an unchanged edit apart. */
    initialTitle: initialTitle.current,
    state,
    /** The formatted title now in the element; it may be ahead of React state mid-IME. */
    currentTitle: () => (input.current ? formatRuns(readRuns(input.current)) : title),
    apply,
    /** Apply now, or once a running IME composition has placed its text. */
    applyWhenComposed(command: FormatCommand, imeActive: boolean) {
      if (imeActive) pendingFormat.current = command;
      else apply(command);
    },
    insertText,
    stepHistory,
    inputHandlers,
  };
}
