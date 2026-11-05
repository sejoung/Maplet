import { forwardRef, useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Eraser } from 'lucide-react';
import { useI18n } from '../i18n/react';
import { HIGHLIGHT_COLORS, HIGHLIGHT_FILLS, type HighlightColor } from '../domain/rich-text';
import type { FormatCommand } from './rich-editing';

const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: 'format.yellow',
  green: 'format.green',
  blue: 'format.blue',
  pink: 'format.pink',
};
const items = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'),
];

/**
 * Formatting for the selected title text, opened by right-clicking a selection while editing.
 * Pressing a mouse button here keeps focus and the selection in the editor.
 */
export const FormatMenu = forwardRef<
  HTMLDivElement,
  {
    at: { x: number; y: number };
    /** Opened from the keyboard: focus moves into the menu. */
    keyboard: boolean;
    bold: boolean;
    highlight: HighlightColor | null | undefined;
    onCommand(command: FormatCommand): void;
    onClose(): void;
    /** Focus left the menu for somewhere other than the menu itself. */
    onFocusOut(next: Node | null): void;
  }
>(function FormatMenu({ at, keyboard, bold, highlight, onCommand, onClose, onFocusOut }, ref) {
  const { t } = useI18n();
  const [position, setPosition] = useState(at);
  const [menu, setMenu] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)),
      y: Math.max(8, at.y + height > window.innerHeight - 8 ? at.y - height : at.y),
    });
    if (keyboard) items(menu)[0]?.focus();
  }, [at, keyboard, menu]);
  const keydown = (event: KeyboardEvent) => {
    const list = items(event.currentTarget as HTMLElement);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    event.stopPropagation();
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') move(index + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };
  return createPortal(
    <div
      ref={(element) => {
        setMenu(element);
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      className="context-menu menu-items format-menu"
      role="menu"
      tabIndex={-1}
      aria-label={t('format.menu')}
      style={{ left: position.x, top: position.y }}
      onKeyDown={keydown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next)) onFocusOut(next);
      }}
      // The menu sits inside the node in React's tree; keep its events from reaching it.
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={bold}
        onClick={() => onCommand({ kind: 'bold' })}
      >
        <Bold size={15} aria-hidden="true" />
        {t('format.bold')}
        <kbd>⌘/Ctrl B</kbd>
      </button>
      <span className="menu-label" aria-hidden="true">
        {t('format.highlight')}
      </span>
      <div className="format-swatches" role="group" aria-label={t('format.highlight')}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="menuitemradio"
            aria-checked={highlight === color}
            aria-label={t(COLOR_LABELS[color])}
            title={t(COLOR_LABELS[color])}
            className="format-swatch"
            style={{ background: HIGHLIGHT_FILLS[color] }}
            onClick={() => onCommand({ kind: 'highlight', color })}
          />
        ))}
      </div>
      <hr />
      <button type="button" role="menuitem" onClick={() => onCommand({ kind: 'clear' })}>
        <Eraser size={15} aria-hidden="true" />
        {t('format.clear')}
        <kbd>⌘/Ctrl \</kbd>
      </button>
    </div>,
    document.body,
  );
});
