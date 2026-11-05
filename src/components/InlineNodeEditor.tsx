import { useI18n } from '../i18n/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatRuns, rangeFormat, replaceRange, richRuns, runsText } from '../domain/rich-text';
import {
  readRuns,
  readSelection,
  renderRuns,
  writeSelection,
  type TextSelection,
} from './rich-dom';
import {
  EditHistory,
  commandRange,
  formatShortcut,
  historyShortcut,
  runCommand,
  type EditorState,
  type FormatCommand,
} from './rich-editing';
import { FormatMenu } from './FormatMenu';
import { useEditorSelectionDrag } from './useEditorSelectionDrag';
import { useRichEditorBridge } from './rich-editor-bridge';

interface MenuState {
  at: { x: number; y: number };
  keyboard: boolean;
  selection: TextSelection;
}

/**
 * Title editor that shows bold, italic and highlighted text as it will look. The title is
 * still stored as a marked-up string; the editor converts on open and on every change.
 * `title` already includes any whole-node emphasis; `storedTitle` is what the node holds,
 * kept as it is when nothing was changed.
 */
export function InlineNodeEditor({
  title,
  storedTitle = title,
  lines,
  lineHeight,
  onDraftChange,
  onCommit,
  onCancel,
  onAdd,
}: {
  title: string;
  storedTitle?: string;
  lines: number;
  lineHeight: number;
  onDraftChange(title: string): void;
  onCommit(title: string, restoreFocus: boolean): boolean;
  onCancel(restoreFocus: boolean): void;
  onAdd(): void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLDivElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const history = useRef(new EditHistory());
  const composing = useRef(false);
  // A shortcut pressed mid-composition waits until the composed text is in place.
  const pendingFormat = useRef<FormatCommand | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const initialTitle = useRef(title);
  const bridge = useRichEditorBridge();
  useEditorSelectionDrag(input);

  const state = useCallback((): EditorState => {
    const element = input.current!;
    const runs = readRuns(element);
    const end = runsText(runs).length;
    return { runs, selection: readSelection(element) ?? { start: end, end } };
  }, []);
  // Read the element, not state: IME composition can end in the same task as a blur.
  const current = () => (input.current ? formatRuns(readRuns(input.current)) : title);
  // The parent passes a new callback on every render; the editor must not reset for that.
  const latestDraftChange = useRef(onDraftChange);
  useLayoutEffect(() => {
    latestDraftChange.current = onDraftChange;
  }, [onDraftChange]);
  const show = useCallback(
    (next: EditorState) => {
      const element = input.current!;
      renderRuns(element, next.runs);
      writeSelection(element, next.selection);
      latestDraftChange.current(formatRuns(next.runs));
      bridge?.notify();
    },
    [bridge],
  );

  // Draw the title once when editing starts; from then on the DOM holds the edit.
  useLayoutEffect(() => {
    const element = input.current!;
    const runs = richRuns(initialTitle.current);
    renderRuns(element, runs);
    element.focus({ preventScroll: true });
    writeSelection(element, { start: 0, end: runsText(runs).length });
  }, []);
  useLayoutEffect(() => {
    const element = input.current!;
    const beforeInput = (event: InputEvent) => {
      const kind = event.inputType;
      if (kind === 'historyUndo' || kind === 'historyRedo') {
        event.preventDefault();
        const restored =
          kind === 'historyUndo' ? history.current.undo(state()) : history.current.redo(state());
        if (restored) show(restored);
      } else if (kind.startsWith('format') || kind === 'insertFromDrop' || kind === 'deleteByDrag')
        // Only our own commands format text, and dropped content could bring markup along.
        event.preventDefault();
      else if (kind !== 'insertCompositionText') history.current.record(state(), kind);
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [state, show]);

  const cancel = (restoreFocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onCancel(restoreFocus);
  };
  const commit = (restoreFocus = true) => {
    if (finished.current) return true;
    finished.current = true;
    const value = current();
    if (!onCommit(value === initialTitle.current ? storedTitle : value, restoreFocus)) {
      finished.current = false;
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
      return false;
    }
    return true;
  };
  const apply = (command: FormatCommand, from = state()) => {
    const next = runCommand(from, command);
    if (!next) return;
    history.current.record(from, 'format');
    show(next);
  };
  const insertText = (text: string) => {
    const before = state();
    const start = Math.min(before.selection.start, before.selection.end);
    const end = Math.max(before.selection.start, before.selection.end);
    history.current.record(before, 'insert-text');
    const at = start + text.length;
    show({ runs: replaceRange(before.runs, start, end, text), selection: { start: at, end: at } });
  };
  // The toolbar formats this editor's selection while it is open.
  const latestApply = useRef(apply);
  useLayoutEffect(() => {
    latestApply.current = apply;
  });
  useEffect(() => {
    if (!bridge) return;
    bridge.attach({
      apply: (command) => latestApply.current(command),
      format: () => {
        if (!input.current) return null;
        const now = state();
        const range = commandRange(now);
        return range ? rangeFormat(now.runs, range.start, range.end) : null;
      },
    });
    const changed = () => bridge.notify();
    document.addEventListener('selectionchange', changed);
    return () => {
      document.removeEventListener('selectionchange', changed);
      bridge.attach(null);
    };
  }, [bridge, state]);
  const openMenu = (at: MenuState['at'], keyboard: boolean) =>
    setMenu({ at, keyboard, selection: state().selection });
  const closeMenu = (refocus: boolean) => {
    const saved = menu?.selection;
    setMenu(null);
    if (refocus && input.current) {
      input.current.focus({ preventScroll: true });
      if (saved) writeSelection(input.current, saved);
    }
  };
  const menuFormat = menu
    ? rangeFormat(
        state().runs,
        Math.min(menu.selection.start, menu.selection.end),
        Math.max(menu.selection.start, menu.selection.end),
      )
    : null;

  return (
    <>
      <div
        ref={input}
        className="inline-node-editor"
        role="textbox"
        aria-multiline="true"
        aria-label={t('common.nodeTitle')}
        tabIndex={0}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck
        data-inline-editor
        style={{ minHeight: lines * lineHeight }}
        onInput={(event) => {
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
          onDraftChange(formatRuns(runs));
          bridge?.notify();
        }}
        onCompositionStart={() => {
          history.current.record(state(), 'compose');
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          const action = pendingFormat.current;
          pendingFormat.current = null;
          if (action) setTimeout(() => apply(action), 0);
        }}
        onBlur={(event) => {
          if (menuElement.current?.contains(event.relatedTarget as Node | null)) return;
          // Leaving with an empty title keeps the previous one instead of leaving an editor
          // behind on a node that is no longer selected.
          if (!runsText(readRuns(event.currentTarget)).trim()) cancel(false);
          else commit(false);
        }}
        onPaste={(event) => {
          event.preventDefault();
          insertText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
          const selection = state().selection;
          // Without a selection the browser's own menu (copy, paste, spelling) stays.
          if (selection.start === selection.end) return;
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY }, false);
        }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (menu && event.button === 0) setMenu(null);
        }}
        onKeyDown={(event) => {
          const native = event.nativeEvent;
          const imeActive = native.isComposing || native.keyCode === 229;
          const command = formatShortcut(event);
          if (command) {
            event.preventDefault();
            event.stopPropagation();
            if (imeActive) pendingFormat.current = command;
            else apply(command);
            return;
          }
          const step = historyShortcut(event);
          if (step && !imeActive) {
            event.preventDefault();
            event.stopPropagation();
            const restored =
              step === 'undo' ? history.current.undo(state()) : history.current.redo(state());
            if (restored) show(restored);
            return;
          }
          if (event.metaKey || event.ctrlKey) return;
          event.stopPropagation();
          if (imeActive) return;
          if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            openMenu({ x: box.left, y: box.bottom + 4 }, true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            if (menu) closeMenu(true);
            else cancel(true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) insertText('\n');
            else commit();
          } else if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            if (commit(false)) onAdd();
          }
        }}
      />
      {menu && menuFormat && (
        <FormatMenu
          ref={menuElement}
          at={menu.at}
          keyboard={menu.keyboard}
          format={menuFormat}
          onCommand={(command) => {
            const from = { ...state(), selection: menu.selection };
            setMenu(null);
            input.current?.focus({ preventScroll: true });
            apply(command, from);
          }}
          onClose={() => closeMenu(true)}
          onFocusOut={(next) => {
            if (input.current?.contains(next)) return;
            setMenu(null);
            commit(false);
          }}
        />
      )}
    </>
  );
}
