import { useLayoutEffect, type RefObject } from 'react';
import { pointAt, readRuns } from './rich-dom';
import { runsText } from '../../domain/rich-text/rich-text';

type Point = [Node, number];

/** The text position under a screen point, from the standard or the older WebKit API. */
function caretAt(x: number, y: number): Point | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return [position.offsetNode, position.offset];
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? [range.startContainer, range.startOffset] : null;
}

/**
 * The nearest editor position to a point anywhere on screen: above the text is its start,
 * below is its end, and beside a line is that line's nearest end.
 */
function nearestPoint(editor: HTMLElement, x: number, y: number): Point {
  const box = editor.getBoundingClientRect();
  const end = () => pointAt(editor, runsText(readRuns(editor)).length);
  if (y < box.top) return pointAt(editor, 0);
  if (y > box.bottom) return end();
  const point = caretAt(
    Math.min(Math.max(x, box.left + 1), box.right - 1),
    Math.min(Math.max(y, box.top + 1), box.bottom - 1),
  );
  return point && editor.contains(point[0]) ? point : end();
}

/** Chrome drags selected text instead of selecting anew when it is pressed. */
function onSelection(editor: HTMLElement, x: number, y: number) {
  const selection = document.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  return [...range.getClientRects()].some(
    (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
  );
}

const inside = (editor: HTMLElement, x: number, y: number) => {
  const box = editor.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
};

/**
 * While a title is edited, the node around the editor is not selectable text, so the browser
 * loses a selection dragged across its padding or out of the node, and a press in the padding
 * would focus the node and end editing. Presses and drags there select editor text instead.
 * Dropping text is not supported, so a press on selected text also starts a new selection.
 */
export function useEditorSelectionDrag(input: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const editor = input.current!;
    const node = editor.closest<HTMLElement>('[data-node-id]') ?? editor.parentElement!;
    let anchor: Point | null = null;
    let wanted: Point | null = null;
    // A press outside the text gets no native selection, so the whole drag is ours.
    let manual = false;
    let lastPress = { time: -Infinity, x: 0, y: 0 };
    const apply = () => {
      const selection = document.getSelection();
      if (!selection || !anchor || !wanted) return;
      const [anchorNode, anchorOffset] = anchor;
      const [focusNode, focusOffset] = wanted;
      if (
        selection.anchorNode === anchorNode &&
        selection.anchorOffset === anchorOffset &&
        selection.focusNode === focusNode &&
        selection.focusOffset === focusOffset
      )
        return;
      selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    };
    const move = (event: PointerEvent) => {
      if (!(event.buttons & 1)) return stop();
      if (!anchor) {
        const selection = document.getSelection();
        if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
        anchor = [selection.anchorNode, selection.anchorOffset];
      }
      // Inside the text the browser's own selection is right, including word dragging.
      wanted =
        !manual && inside(editor, event.clientX, event.clientY)
          ? null
          : nearestPoint(editor, event.clientX, event.clientY);
      apply();
    };
    // The browser may still collapse the selection after our update; keep the wanted one.
    const keep = () => {
      if (wanted) apply();
    };
    const stop = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('selectionchange', keep);
    };
    const up = () => {
      stop();
      if (!wanted) return;
      // The click that follows can reset the selection once more.
      requestAnimationFrame(apply);
      setTimeout(() => {
        apply();
        anchor = wanted = null;
      }, 0);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element;
      anchor = wanted = null;
      const outside = !editor.contains(target);
      // Node buttons (collapse, task, links) keep working while editing.
      if (outside && target.closest('button,a,[role="menu"]')) return;
      // Double and triple clicks land on the word or line the previous click selected.
      const repeated =
        event.timeStamp - lastPress.time < 500 &&
        Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) < 5;
      lastPress = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      manual = outside || (!repeated && onSelection(editor, event.clientX, event.clientY));
      if (manual) {
        event.preventDefault();
        event.stopPropagation();
        editor.focus({ preventScroll: true });
        const point = nearestPoint(editor, event.clientX, event.clientY);
        const selection = document.getSelection();
        if (event.shiftKey && selection?.anchorNode && editor.contains(selection.anchorNode))
          anchor = [selection.anchorNode, selection.anchorOffset];
        else anchor = point;
        wanted = point;
        apply();
      }
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('selectionchange', keep);
    };
    node.addEventListener('pointerdown', down);
    return () => {
      node.removeEventListener('pointerdown', down);
      stop();
    };
  }, [input]);
}
