import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/react';
import { NodeActionItems, type NodeAction } from './node-actions';

const items = (menu: HTMLElement) => [
  ...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
];

/** Node actions at the pointer (right-click, long-press) or the node (keyboard). */
export function NodeContextMenu({
  groups,
  at,
  onClose,
}: {
  groups: NodeAction[][];
  at: { x: number; y: number };
  onClose(restoreFocus: boolean): void;
}) {
  const { t } = useI18n();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(at);
  useLayoutEffect(() => {
    const element = menu.current!;
    const { width, height } = element.getBoundingClientRect();
    // Keep the whole menu on screen, flipping near the right and bottom edges.
    setPosition({
      x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)),
      y: Math.max(8, at.y + height > window.innerHeight - 8 ? at.y - height : at.y),
    });
    items(element)[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [at, onClose]);
  const keydown = (event: KeyboardEvent) => {
    const list = items(menu.current!);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    event.stopPropagation();
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') {
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
      aria-label={t('노드 메뉴')}
      style={{ left: position.x, top: position.y }}
      onKeyDown={keydown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <NodeActionItems
        groups={groups}
        role="menuitem"
        wrap={(action) => () => {
          onClose(false);
          action();
        }}
      />
    </div>
  );
}
