import { useI18n } from '../i18n/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ordered, type TextSelection } from '../domain/rich-editing';
import { rangeFormat, runsText } from '../domain/rich-text';
import { readRuns, writeSelection } from './rich-dom';
import { formatShortcut, historyShortcut, titleKey, type TitleKey } from './rich-shortcuts';
import { FormatMenu } from './FormatMenu';
import { useEditorSelectionDrag } from './useEditorSelectionDrag';
import { useRichTextEditor } from './useRichTextEditor';
import { usePreferences } from './preferences';
import { anchorBelow } from './canvas-dom';

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
  // Commit and cancel both end the session; blur after either must not end it again.
  const finished = useRef(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [{ highlight }] = usePreferences();
  const editor = useRichTextEditor(input, { title, onDraftChange });
  useEditorSelectionDrag(input);

  const cancel = (restoreFocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onCancel(restoreFocus);
  };
  const commit = (restoreFocus = true) => {
    if (finished.current) return true;
    finished.current = true;
    // Read the element, not state: IME composition can end in the same task as a blur.
    const value = editor.currentTitle();
    if (!onCommit(value === editor.initialTitle ? storedTitle : value, restoreFocus)) {
      finished.current = false;
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
      return false;
    }
    return true;
  };
  const openMenu = (at: MenuState['at'], keyboard: boolean) =>
    setMenu({ at, keyboard, selection: editor.state().selection });
  const closeMenu = (refocus: boolean) => {
    const saved = menu?.selection;
    setMenu(null);
    if (refocus && input.current) {
      input.current.focus({ preventScroll: true });
      if (saved) writeSelection(input.current, saved);
    }
  };
  const menuRange = menu && ordered(menu.selection);
  const menuFormat = menuRange
    ? rangeFormat(editor.state().runs, menuRange.start, menuRange.end)
    : null;
  const titleKeys: Record<TitleKey, () => void> = {
    menu: () => openMenu(anchorBelow(input.current!.getBoundingClientRect(), 0), true),
    escape: () => (menu ? closeMenu(true) : cancel(true)),
    newline: () => editor.insertText('\n'),
    commit: () => commit(),
    next: () => {
      if (commit(false)) onAdd();
    },
  };
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const native = event.nativeEvent;
    const imeActive = native.isComposing || native.keyCode === 229;
    const command = formatShortcut(event, highlight);
    if (command) {
      event.preventDefault();
      event.stopPropagation();
      editor.applyWhenComposed(command, imeActive);
      return;
    }
    const step = historyShortcut(event);
    if (step && !imeActive) {
      event.preventDefault();
      event.stopPropagation();
      editor.stepHistory(step);
      return;
    }
    // Other modified keys continue to the app's shortcuts (save, zoom); plain ones are text.
    if (event.metaKey || event.ctrlKey) return;
    event.stopPropagation();
    const action = imeActive ? null : titleKey(event);
    if (!action) return;
    event.preventDefault();
    titleKeys[action]();
  };

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
        {...editor.inputHandlers}
        onBlur={(event) => {
          if (menuElement.current?.contains(event.relatedTarget as Node | null)) return;
          // Leaving with an empty title keeps the previous one instead of leaving an editor
          // behind on a node that is no longer selected.
          if (!runsText(readRuns(event.currentTarget)).trim()) cancel(false);
          else commit(false);
        }}
        onPaste={(event) => {
          event.preventDefault();
          editor.insertText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
          const selection = editor.state().selection;
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
        onKeyDown={keydown}
      />
      {menu && menuFormat && (
        <FormatMenu
          ref={menuElement}
          at={menu.at}
          keyboard={menu.keyboard}
          format={menuFormat}
          onCommand={(command) => {
            const from = { ...editor.state(), selection: menu.selection };
            setMenu(null);
            input.current?.focus({ preventScroll: true });
            editor.apply(command, from);
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
