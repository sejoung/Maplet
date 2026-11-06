import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { HighlightColor } from '../domain/rich-text';
import type { CanvasProps } from './canvas-types';
import { formatShortcut } from './rich-shortcuts';

type KeyboardProps = Pick<
  CanvasProps,
  | 'map'
  | 'selected'
  | 'selection'
  | 'onSelect'
  | 'onSelectNodes'
  | 'onAdd'
  | 'onEdit'
  | 'onDelete'
  | 'onToggle'
  | 'onFormatNodes'
  | 'onDuplicate'
  | 'onReorder'
>;

export interface KeyboardActions {
  /** Whether a pointer gesture holds the canvas; Escape abandons it. */
  isBusy(): boolean;
  cancelGesture(): void;
  pan(): void;
  openMenu(): void;
  selectAll(): void;
  focusNode(id: string): void;
  /** The highlighter color the shortcut applies. */
  highlight: HighlightColor;
}

export function canvasKeydown(
  event: KeyboardEvent,
  props: KeyboardProps,
  actions: KeyboardActions,
) {
  // Checked first: the resize handle that holds focus mid-resize is a button.
  if (event.key === 'Escape' && actions.isBusy()) {
    event.preventDefault();
    actions.cancelGesture();
    return;
  }
  if ((event.target as HTMLElement).closest('button,input,textarea,select,[data-inline-editor]'))
    return;
  if (event.nativeEvent.isComposing) return;
  const { map, selected, onSelect, onAdd, onEdit, onDelete, onToggle } = props;
  const node = map.nodes[selected];
  if (event.key === 'Escape' && props.selection.length > 1) {
    event.preventDefault();
    onSelect(selected);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    actions.selectAll();
    return;
  }
  const format = formatShortcut(event, actions.highlight);
  if (format) {
    event.preventDefault();
    props.onFormatNodes(format);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    if (node.parentId !== null) props.onDuplicate(selected);
    return;
  }
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    props.onReorder(selected, event.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (event.key === 'F10' && event.shiftKey) {
    event.preventDefault();
    actions.openMenu();
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
      // Shift extends the selection along the way instead of replacing it.
      if (event.shiftKey)
        props.onSelectNodes([...props.selection.filter((id) => id !== next), next], next);
      else onSelect(next);
      actions.focusNode(next);
    }
  } else if (event.key === ' ') {
    event.preventDefault();
    actions.pan();
  }
}

const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest('input,textarea,select,[data-inline-editor]'));

/** Copy and cut share the selected branch with other apps as an indented outline. */
export function canvasClipboard({
  selected,
  editingId,
  onCopy,
  onCut,
  onPaste,
}: Pick<CanvasProps, 'selected' | 'editingId' | 'onCopy' | 'onCut' | 'onPaste'>) {
  const take = (event: ClipboardEvent, action: (id: string) => string | null) => {
    if (editingId || isEditable(event.target)) return;
    const text = action(selected);
    if (text === null) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  };
  return {
    onCopy: (event: ClipboardEvent) => take(event, onCopy),
    onCut: (event: ClipboardEvent) => take(event, onCut),
    onPaste: (event: ClipboardEvent) => {
      if (editingId || isEditable(event.target)) return;
      event.preventDefault();
      onPaste(selected, event.clipboardData.getData('text/plain'));
    },
  };
}
