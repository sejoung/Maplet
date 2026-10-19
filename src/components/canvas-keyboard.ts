import type { KeyboardEvent, RefObject } from 'react';
import type { CanvasProps } from './canvas-types';

export function canvasKeydown(
  event: KeyboardEvent,
  props: CanvasProps,
  viewport: RefObject<HTMLDivElement | null>,
  actions: { isDragging(): boolean; cancelDrag(): void; pan(): void },
) {
  if ((event.target as HTMLElement).closest('button,input,textarea,select')) return;
  if (event.nativeEvent.isComposing) return;
  const { map, selected, onSelect, onAdd, onEdit, onDelete, onToggle } = props;
  const node = map.nodes[selected];
  if (event.key === 'Escape' && actions.isDragging()) {
    event.preventDefault();
    actions.cancelDrag();
    return;
  }
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    onAdd();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    onAdd(true);
  } else if (event.key === 'F2') {
    event.preventDefault();
    onEdit();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    onDelete();
  } else if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    let next: string | undefined;
    if (event.key === 'ArrowLeft')
      next = node.side === 'left' ? node.children[0] : (node.parentId ?? undefined);
    if (event.key === 'ArrowRight')
      next = node.side === 'left' ? (node.parentId ?? undefined) : node.children[0];
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const siblings = node.parentId ? map.nodes[node.parentId].children : map.roots;
      next = siblings[siblings.indexOf(selected) + (event.key === 'ArrowUp' ? -1 : 1)];
    }
    if (next) {
      if (node.collapsed && node.children.includes(next)) onToggle(selected);
      onSelect(next);
      requestAnimationFrame(() =>
        viewport.current
          ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(next!)}"]`)
          ?.focus(),
      );
    }
  } else if (event.key === ' ') {
    event.preventDefault();
    actions.pan();
  }
}
