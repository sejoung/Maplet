import { forwardRef, useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../i18n/react';
import {
  HIGHLIGHT_COLORS,
  type FormatCommand,
  type RangeFormat,
} from '../../../domain/rich-text/rich-text';
import { CLEAR_FORMAT, FORMAT_TOGGLES, swatchProps } from './format-commands';
import { clampToViewport, moveMenuFocus, viewportSize } from '../../menus/menu-keys';

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
    /** Formatting the selected text already shares. */
    format: RangeFormat;
    onCommand(command: FormatCommand): void;
    onClose(): void;
    /** Focus left the menu for somewhere other than the menu itself. */
    onFocusOut(next: Node | null): void;
  }
>(function FormatMenu({ at, keyboard, format, onCommand, onClose, onFocusOut }, ref) {
  const { t } = useI18n();
  const [position, setPosition] = useState(at);
  const [menu, setMenu] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!menu) return;
    setPosition(clampToViewport(at, menu.getBoundingClientRect(), viewportSize()));
    if (keyboard) items(menu)[0]?.focus();
  }, [at, keyboard, menu]);
  const keydown = (event: KeyboardEvent) => {
    event.stopPropagation();
    // The swatches sit in a row, so ←→ step through the items too.
    if (moveMenuFocus(items(event.currentTarget as HTMLElement), event, { across: true })) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
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
      {FORMAT_TOGGLES.map(({ command, icon: Icon, label, keys }) => (
        <button
          key={command.kind}
          type="button"
          role="menuitemcheckbox"
          aria-checked={format[command.kind] === true}
          onClick={() => onCommand(command)}
        >
          <Icon size={15} aria-hidden="true" />
          {t(label)}
          <kbd>{keys}</kbd>
        </button>
      ))}
      <span className="menu-label" aria-hidden="true">
        {t('format.highlight')}
      </span>
      <div className="format-swatches" role="group" aria-label={t('format.highlight')}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="menuitemradio"
            aria-checked={format.highlight === color}
            {...swatchProps(color, t)}
            onClick={() => onCommand({ kind: 'highlight', color })}
          />
        ))}
      </div>
      <hr />
      <button type="button" role="menuitem" onClick={() => onCommand(CLEAR_FORMAT.command)}>
        <CLEAR_FORMAT.icon size={15} aria-hidden="true" />
        {t(CLEAR_FORMAT.label)}
        <kbd>{CLEAR_FORMAT.keys}</kbd>
      </button>
    </div>,
    document.body,
  );
});
