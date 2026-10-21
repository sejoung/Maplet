import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { MindMap, NodePosition } from '../domain/model';
import { topLevel } from '../domain/selection';
import type { Layout } from '../engine/layout';
import type { PlacementProposal } from '../engine/subtree-placement';
import { dragFrame, nodesInRect, type DropTarget } from '../engine/branch-drag';
import { clampZoom } from '../engine/fit-layout';
import type { CanvasProps, CanvasView } from './canvas-types';

export interface DragPreview {
  ids: string[];
  source: MindMap;
  documentKey: number;
  layout: Layout;
  regions: PlacementProposal['regions'];
  target: DropTarget | null;
  /** Alt/Option is held: the drag only moves branches. */
  free: boolean;
}
/** A selection rectangle in canvas pixels. */
export interface Marquee {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Options extends Pick<
  CanvasProps,
  | 'map'
  | 'selected'
  | 'selection'
  | 'documentKey'
  | 'editingId'
  | 'onSelect'
  | 'onSelectNodes'
  | 'onReposition'
  | 'onReparent'
> {
  layout: Layout;
  view: CanvasView;
  viewRef: RefObject<CanvasView>;
  setView: Dispatch<SetStateAction<CanvasView>>;
  viewport: RefObject<HTMLDivElement | null>;
  panMode: boolean;
  resizing: boolean;
}

const additive = (event: PointerEvent) => event.shiftKey || event.metaKey || event.ctrlKey;

/**
 * Pointer gestures on the canvas: dragging branches (alone or as a selected group, onto a new
 * parent or to a free position), Shift-drag box selection, panning and pinch zoom.
 */
export function useCanvasPointer(options: Options) {
  const { map, layout, view, viewRef, setView, viewport, documentKey, editingId } = options;
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const suppressClick = useRef(false);
  const nodeDrag = useRef<{
    pointerId: number;
    id: string;
    ids: string[];
    x: number;
    y: number;
    zoom: number;
    origin: NodePosition;
    delta: NodePosition;
    layout: Layout;
    pointer: { clientX: number; clientY: number };
    proposal: PlacementProposal | null;
    target: DropTarget | null;
    moved: boolean;
  } | null>(null);
  const box = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const gesture = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    distance: number;
    zoom: number;
    tap: boolean;
  } | null>(null);
  const cancelDrag = () => {
    nodeDrag.current = null;
    box.current = null;
    setPreview(null);
    setMarquee(null);
  };
  const reset = () => {
    pointers.current.clear();
    cancelDrag();
    gesture.current = null;
    setPanning(false);
  };
  useLayoutEffect(() => {
    pointers.current.clear();
    nodeDrag.current = null;
    box.current = null;
    setPreview(null);
    setMarquee(null);
    gesture.current = null;
    setPanning(false);
  }, [map, documentKey, editingId]);
  const dragPreview =
    preview?.source === map && preview.documentKey === documentKey && !editingId ? preview : null;
  const isDragging = useCallback(() => Boolean(nodeDrag.current || box.current), []);
  const suppressNextClick = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    if (options.resizing || event.button !== 0 || target.closest('button,input,textarea,select,a'))
      return;
    const nodeElement = target.closest<HTMLElement>('[data-node-id]');
    const id = nodeElement?.dataset.nodeId;
    if (id === editingId) return;
    // Modified clicks on a node toggle it in the selection when the click arrives.
    if (id && additive(event)) return;
    suppressClick.current = false;
    // Capture on the node so ordinary clicks and double-clicks keep their target.
    const captureTarget = nodeElement && !options.panMode ? nodeElement : viewport.current!;
    captureTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const rect = viewport.current!.getBoundingClientRect();
    if (points.length === 1 && id && !options.panMode) {
      const group = options.selection.length > 1 && options.selection.includes(id);
      const placed = layout.nodes.find((node) => node.id === id)!;
      const origin = { x: placed.x, y: placed.y };
      nodeDrag.current = {
        pointerId: event.pointerId,
        id,
        ids: group ? topLevel(map, options.selection) : [id],
        x: event.clientX,
        y: event.clientY,
        zoom: view.zoom,
        origin,
        delta: { x: 0, y: 0 },
        layout,
        pointer: { clientX: event.clientX, clientY: event.clientY },
        proposal: null,
        target: null,
        moved: false,
      };
      gesture.current = null;
      // A group keeps its selection; a click without movement selects only this node.
      if (!group) options.onSelect(id);
      nodeElement!.focus({ preventScroll: true });
      return;
    }
    cancelDrag();
    if (points.length === 1 && additive(event) && !options.panMode) {
      box.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
      };
      return;
    }
    const mid =
      points.length > 1
        ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
        : points[0];
    gesture.current = {
      x: mid.x,
      y: mid.y,
      vx: view.x,
      vy: view.y,
      distance:
        points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      zoom: view.zoom,
      tap: points.length === 1 && !id,
    };
    setPanning(true);
  };

  const dragTo = (event: { clientX: number; clientY: number; altKey: boolean }) => {
    const drag = nodeDrag.current!;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.pointer = { clientX: event.clientX, clientY: event.clientY };
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    const delta = { x: dx / drag.zoom, y: dy / drag.zoom };
    const frame = dragFrame(map, drag.layout, {
      ids: drag.ids,
      origin: drag.origin,
      delta,
      head: drag.id,
      zoom: drag.zoom,
      free: event.altKey,
      target: drag.target,
    });
    if (!frame) return;
    Object.assign(drag, {
      moved: true,
      delta,
      proposal: frame.proposal,
      target: frame.target,
    });
    setPreview({
      ids: drag.ids,
      source: map,
      documentKey,
      layout: frame.layout,
      regions: frame.proposal.regions,
      target: frame.target,
      free: event.altKey,
    });
  };
  // Pressing or releasing Alt/Option mid-drag switches modes without moving the pointer.
  const latestDragTo = useRef(dragTo);
  useLayoutEffect(() => {
    latestDragTo.current = dragTo;
  });
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const drag = nodeDrag.current;
      if (event.key !== 'Alt' || !drag?.moved) return;
      event.preventDefault();
      latestDragTo.current({ ...drag.pointer, altKey: event.type === 'keydown' });
    };
    // Capture: focused nodes stop their key events from bubbling.
    window.addEventListener('keydown', toggle, true);
    window.addEventListener('keyup', toggle, true);
    return () => {
      window.removeEventListener('keydown', toggle, true);
      window.removeEventListener('keyup', toggle, true);
    };
  }, []);

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (nodeDrag.current?.pointerId === event.pointerId) return dragTo(event);
    const selecting = box.current;
    if (selecting?.pointerId === event.pointerId) {
      setMarquee({
        x: Math.min(selecting.x, event.clientX) - selecting.left,
        y: Math.min(selecting.y, event.clientY) - selecting.top,
        width: Math.abs(event.clientX - selecting.x),
        height: Math.abs(event.clientY - selecting.y),
      });
      return;
    }
    const start = gesture.current;
    if (!start) return;
    const points = [...pointers.current.values()];
    if (points.length > 1 && start.distance) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const rect = viewport.current!.getBoundingClientRect();
      const x = (points[0].x + points[1].x) / 2 - rect.left;
      const y = (points[0].y + points[1].y) / 2 - rect.top;
      const zoom = clampZoom((start.zoom * distance) / start.distance);
      setView({
        zoom,
        x: x - ((start.x - rect.left - start.vx) * zoom) / start.zoom,
        y: y - ((start.y - rect.top - start.vy) * zoom) / start.zoom,
      });
    } else {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) >= 4) start.tap = false;
      setView((current) => ({ ...current, x: start.vx + dx, y: start.vy + dy }));
    }
  };

  const finishDrag = () => {
    const drag = nodeDrag.current!;
    cancelDrag();
    if (!drag.moved) return;
    suppressNextClick();
    const target = drag.target;
    if (target)
      options.onReparent(
        drag.ids,
        target.id,
        target.side,
        target.place === 'child' ? undefined : { id: target.node, after: target.place === 'after' },
      );
    else if (
      drag.proposal &&
      (drag.delta.x !== 0 || drag.delta.y !== 0 || drag.proposal.displacedIds.length > 0)
    )
      options.onReposition(drag.proposal.positions);
  };

  const finishBox = () => {
    const area = marquee;
    cancelDrag();
    if (!area || area.width < 4 || area.height < 4) return;
    suppressNextClick();
    const current = viewRef.current;
    const ids = nodesInRect(layout, {
      x: (area.x - current.x) / current.zoom,
      y: (area.y - current.y) / current.zoom,
      width: area.width / current.zoom,
      height: area.height / current.zoom,
    });
    if (ids.length)
      options.onSelectNodes(ids, ids.includes(options.selected) ? options.selected : ids[0]);
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (nodeDrag.current?.pointerId === event.pointerId) finishDrag();
    if (box.current?.pointerId === event.pointerId) finishBox();
    // A plain click on empty canvas narrows a group selection back to its focused node.
    if (gesture.current?.tap && options.selection.length > 1) options.onSelect(options.selected);
    const remaining = [...pointers.current.values()][0];
    const current = viewRef.current;
    gesture.current = remaining
      ? {
          x: remaining.x,
          y: remaining.y,
          vx: current.x,
          vy: current.y,
          distance: 0,
          zoom: current.zoom,
          tap: false,
        }
      : null;
    setPanning(Boolean(remaining));
    const captureTarget = event.target as HTMLElement;
    if (captureTarget.hasPointerCapture(event.pointerId))
      captureTarget.releasePointerCapture(event.pointerId);
  };

  return {
    dragPreview,
    panning,
    marquee,
    isDragging,
    cancelDrag: () => {
      cancelDrag();
      gesture.current = null;
    },
    handlers: {
      onClickCapture: (event: MouseEvent) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
      onLostPointerCapture: (event: PointerEvent) => {
        if (pointers.current.has(event.pointerId)) reset();
      },
    },
  };
}
