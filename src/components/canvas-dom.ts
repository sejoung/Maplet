import type { NodePosition } from '../domain/model';

/** Text fields that own their keys while focused: the title editor and the file name. */
export const TEXT_EDITOR_SELECTOR = '[data-inline-editor],[data-filename-editor]';
/** Controls inside the canvas that keep their own pointer and key handling. */
export const CONTROL_SELECTOR = 'button,input,textarea,select,a';

export const nodeSelector = (id: string) => `[data-node-id="${CSS.escape(id)}"]`;

export const nodeElement = (root: ParentNode, id: string) =>
  root.querySelector<HTMLElement>(nodeSelector(id));

export interface FocusOptions {
  /** Where to look; by default the whole document. */
  root?: () => ParentNode | null | undefined;
  preventScroll?: boolean;
  /** Only a node that is still selected then. */
  selected?: boolean;
  /** Not while a title editor is open: it keeps focus. */
  unlessEditing?: boolean;
}

/**
 * Focus a node after React has rendered the change that led here; `null` focuses the
 * canvas's tab stop, the primary selected node.
 */
export function focusNodeLater(id: string | null, options: FocusOptions = {}) {
  const { root = () => document, preventScroll = false, selected = false } = options;
  return requestAnimationFrame(() => {
    const scope = root();
    if (!scope || (options.unlessEditing && scope.querySelector('[data-inline-editor]'))) return;
    const target = id === null ? '[data-node-id][tabindex="0"]' : nodeSelector(id);
    scope
      .querySelector<HTMLElement>(selected ? `${target}[aria-selected="true"]` : target)
      ?.focus({ preventScroll });
  });
}

/** Where a menu opened from the keyboard appears: just below the element's start. */
export const anchorBelow = (rect: DOMRect, inset = 8): NodePosition => ({
  x: rect.left + inset,
  y: rect.bottom + 4,
});
export const anchorCenter = (rect: DOMRect): NodePosition => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/**
 * Where a context menu opens: at the pointer, or at `keyboard` when the menu key or
 * Shift+F10 opened it, which reports no pointer position.
 */
export function menuAnchor(
  event: { clientX: number; clientY: number },
  keyboard: NodePosition,
): NodePosition {
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  return fromKeyboard ? keyboard : { x: event.clientX, y: event.clientY };
}

/** What a press on the canvas landed on: a node, a node's resize handle or another control. */
export function pressTarget(target: Element) {
  const node = target.closest<HTMLElement>('[data-node-id]');
  return {
    node,
    nodeId: node?.dataset.nodeId,
    handle: target.closest<HTMLElement>('[data-resize-handle]'),
    control: Boolean(target.closest(CONTROL_SELECTOR)),
  };
}
