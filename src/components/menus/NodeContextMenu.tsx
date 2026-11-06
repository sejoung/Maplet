import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/react';
import { MenuItems, type MenuGroup } from './menu-actions';
import { clampToViewport, moveMenuFocus, viewportSize } from './menu-keys';

const items = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
];

/** Node or canvas actions at the pointer (right-click) or the focused node (keyboard). */
export function NodeContextMenu({
  groups,
  at,
  label = 'common.nodeMenu',
  onClose,
}: {
  groups: readonly MenuGroup[];
  at: { x: number; y: number };
  label?: string;
  onClose(restoreFocus: boolean): void;
}) {
  const { t } = useI18n();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(at);
  useLayoutEffect(() => {
    const element = menu.current!;
    setPosition(clampToViewport(at, element.getBoundingClientRect(), viewportSize()));
    items(element)[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [at, onClose]);
  const keydown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (moveMenuFocus(items(menu.current!), event)) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    }
  };
  return (
    <div
      ref={menu}
      className="context-menu menu-items"
      role="menu"
      tabIndex={-1}
      aria-label={t(label)}
      style={{ left: position.x, top: position.y }}
      onKeyDown={keydown}
      onContextMenu={(event) => event.preventDefault()}
      // Closing waits for the bubble phase: closing on capture would unmount the item before
      // its command ran. Both updates land in one render.
      onClick={(event) => {
        if ((event.target as Element).closest('button')) onClose(false);
      }}
    >
      <MenuItems groups={groups} role="menuitem" />
    </div>
  );
}
