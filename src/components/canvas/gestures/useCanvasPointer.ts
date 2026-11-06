import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { MindMap } from '../../../domain/model';
import { topLevel } from '../../../domain/selection';
import type { Layout } from '../../../engine/layout/layout';
import type { PlacementProposal } from '../../../engine/layout/subtree-placement';
import {
  DRAG_THRESHOLD,
  dragFrame,
  nodesInRect,
  type DropTarget,
} from '../../../engine/branch-drag';
import { toMapRect } from '../../../engine/viewport';
import type { CanvasProps } from '../canvas-types';
import type { CanvasCamera } from '../view/useCanvasView';
import type { ResizeGesture } from './useNodeResize';
import { pressTarget } from '../canvas-dom';
import {
  classifyPress,
  IDLE,
  isBusy,
  marqueeRect,
  panView,
  pinchView,
  startPan,
  startPinch,
  travelled,
  type Gesture,
  type NodeDrag,
  type Point,
} from './canvas-gestures';
import { useLatest } from '../../shared/useLatest';

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
  camera: Pick<CanvasCamera, 'viewRef' | 'setView' | 'toViewport'>;
  viewport: RefObject<HTMLDivElement | null>;
  panMode: boolean;
  resize: ResizeGesture;
}

/** What each gesture does as its pointer moves, when it is released, and when it is cut off. */
interface Handlers<G extends Gesture> {
  move?(gesture: G, at: Point, event: PointerEvent): void;
  finish?(gesture: G): void;
  cancel?(gesture: G): void;
}

const point = (event: { clientX: number; clientY: number }): Point => ({
  x: event.clientX,
  y: event.clientY,
});
const additive = (event: PointerEvent) => event.shiftKey || event.metaKey || event.ctrlKey;

/**
 * Pointer gestures on the canvas: dragging branches (alone or as a selected group, onto a new
 * parent or to a free position), Shift-drag box selection, panning, pinch zoom and resizing
 * a node by its handle. One gesture runs at a time; see `Gesture`.
 */
export function useCanvasPointer(options: Options) {
  const { map, layout, camera, viewport, documentKey, editingId, resize } = options;
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(IDLE);
  const suppressClick = useRef(false);
  const suppressNextClick = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const dragTo = (drag: NodeDrag, at: Point, free: boolean) => {
    drag.pointer = at;
    if (!drag.moved && !travelled(drag.start, at)) return;
    const delta = { x: (at.x - drag.start.x) / drag.zoom, y: (at.y - drag.start.y) / drag.zoom };
    const frame = dragFrame(map, drag.layout, {
      ids: drag.ids,
      origin: drag.origin,
      delta,
      head: drag.id,
      zoom: drag.zoom,
      free,
      target: drag.target,
    });
    if (!frame) return;
    Object.assign(drag, { moved: true, delta, proposal: frame.proposal, target: frame.target });
    setPreview({
      ids: drag.ids,
      source: map,
      documentKey,
      layout: frame.layout,
      regions: frame.proposal.regions,
      target: frame.target,
      free,
    });
  };

  const handlers: { [K in Gesture['kind']]: Handlers<Extract<Gesture, { kind: K }>> } = {
    idle: {},
    nodeDrag: {
      move: (drag, at, event) => dragTo(drag, at, event.altKey),
      finish(drag) {
        if (!drag.moved) return;
        suppressNextClick();
        const target = drag.target;
        if (target)
          options.onReparent(
            drag.ids,
            target.id,
            target.side,
            target.place === 'child'
              ? undefined
              : { id: target.node, after: target.place === 'after' },
          );
        else if (
          drag.proposal &&
          (drag.delta.x !== 0 || drag.delta.y !== 0 || drag.proposal.displacedIds.length > 0)
        )
          options.onReposition(drag.proposal.positions);
      },
    },
    marquee: {
      move(box, at) {
        box.end = at;
        setMarquee(marqueeRect(box));
      },
      finish(box) {
        const area = marqueeRect(box);
        if (area.width < DRAG_THRESHOLD || area.height < DRAG_THRESHOLD) return;
        suppressNextClick();
        const ids = nodesInRect(layout, toMapRect(camera.viewRef.current, area));
        if (ids.length)
          options.onSelectNodes(ids, ids.includes(options.selected) ? options.selected : ids[0]);
      },
    },
    pan: {
      move(pan, at) {
        if (travelled(pan.start, at)) pan.tap = false;
        camera.setView(panView(pan, at));
      },
      finish(pan) {
        // A plain click on empty canvas narrows a group selection back to its focused node.
        if (pan.tap && options.selection.length > 1) options.onSelect(options.selected);
      },
    },
    pinch: {
      move(pinch) {
        const local = (at: Point) => camera.toViewport(at.x, at.y);
        camera.setView(pinchView(pinch, [...pointers.current.values()], local));
      },
    },
    resize: {
      move: (_, at) => resize.move(at),
      finish: () => resize.finish(),
      cancel: () => resize.cancel(),
    },
  };
  // Each entry only ever receives its own kind of gesture.
  const on = (current: Gesture) => handlers[current.kind] as Handlers<Gesture>;

  /** Switch gestures, clearing whatever the previous one showed. */
  const settle = (next: Gesture) => {
    gesture.current = next;
    setPreview(null);
    setMarquee(null);
    setPanning(next.kind === 'pan' || next.kind === 'pinch');
  };
  /** The single way a gesture is abandoned: Escape, a lost pointer or a changed document. */
  const cancel = () => {
    const current = gesture.current;
    settle(IDLE);
    on(current).cancel?.(current);
  };
  const reset = () => {
    pointers.current.clear();
    cancel();
  };
  const latest = useLatest({ reset, dragTo });
  useLayoutEffect(() => latest.current.reset(), [map, documentKey, editingId, latest]);
  const dragPreview =
    preview?.source === map && preview.documentKey === documentKey && !editingId ? preview : null;
  const busy = useCallback(() => isBusy(gesture.current), []);

  // Pressing or releasing Alt/Option mid-drag switches modes without moving the pointer.
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const drag = gesture.current;
      if (event.key !== 'Alt' || drag.kind !== 'nodeDrag' || !drag.moved) return;
      event.preventDefault();
      latest.current.dragTo(drag, drag.pointer, event.type === 'keydown');
    };
    // Capture: focused nodes stop their key events from bubbling.
    window.addEventListener('keydown', toggle, true);
    window.addEventListener('keyup', toggle, true);
    return () => {
      window.removeEventListener('keydown', toggle, true);
      window.removeEventListener('keyup', toggle, true);
    };
  }, [latest]);

  const onPointerDown = (event: PointerEvent) => {
    const target = pressTarget(event.target as Element);
    const press = {
      button: event.button,
      additive: additive(event),
      nodeId: target.nodeId,
      handle: Boolean(target.handle),
      control: target.control,
      down: pointers.current.size,
    };
    const kind = classifyPress(press, {
      current: gesture.current.kind,
      panMode: options.panMode,
      editingId,
    });
    if (kind === 'ignore') return;
    suppressClick.current = false;
    // Capture on the node or handle so ordinary clicks and double-clicks keep their target.
    const captureTarget =
      target.handle ?? (target.node && !options.panMode ? target.node : viewport.current!);
    captureTarget.setPointerCapture(event.pointerId);
    const at = point(event);
    pointers.current.set(event.pointerId, at);
    const view = camera.viewRef.current;
    const { pointerId } = event;
    if (kind === 'resize') {
      // Keep focus on the handle, where its keys work, rather than on the node.
      event.preventDefault();
      target.handle!.focus({ preventScroll: true });
      settle({ kind, pointerId });
      resize.start(target.nodeId!, at, view.zoom);
    } else if (kind === 'nodeDrag') {
      const id = target.nodeId!;
      const group = options.selection.length > 1 && options.selection.includes(id);
      const placed = layout.nodes.find((node) => node.id === id)!;
      settle({
        kind,
        pointerId,
        id,
        ids: group ? topLevel(map, options.selection) : [id],
        start: at,
        pointer: at,
        zoom: view.zoom,
        origin: { x: placed.x, y: placed.y },
        layout,
        delta: { x: 0, y: 0 },
        proposal: null,
        target: null,
        moved: false,
      });
      // A group keeps its selection; a click without movement selects only this node.
      if (!group) options.onSelect(id);
      target.node!.focus({ preventScroll: true });
    } else if (kind === 'marquee') {
      const rect = viewport.current!.getBoundingClientRect();
      settle({ kind, pointerId, start: at, end: at, origin: { x: rect.left, y: rect.top } });
    } else if (kind === 'pinch') settle(startPinch([...pointers.current.values()], view));
    else settle(startPan(at, view, !target.nodeId));
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    const at = point(event);
    pointers.current.set(event.pointerId, at);
    const current = gesture.current;
    if ('pointerId' in current && current.pointerId !== event.pointerId) return;
    on(current).move?.(current, at, event);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = gesture.current;
    const foreign = 'pointerId' in current && current.pointerId !== event.pointerId;
    if (pointers.current.delete(event.pointerId) && !foreign) {
      // Lifting one finger of a pinch keeps panning with the other.
      const remaining = [...pointers.current.values()][0];
      settle(remaining ? startPan(remaining, camera.viewRef.current, false) : IDLE);
      on(current).finish?.(current);
    }
    const captureTarget = event.target as HTMLElement;
    if (captureTarget.hasPointerCapture(event.pointerId))
      captureTarget.releasePointerCapture(event.pointerId);
  };

  return {
    dragPreview,
    panning,
    marquee,
    /** Whether a drag, box selection or resize holds the canvas. */
    isBusy: busy,
    cancel,
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
