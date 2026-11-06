import type { NodePosition } from '../../../domain/model';
import { DRAG_THRESHOLD, type DropTarget } from '../../../engine/branch-drag';
import type { Layout } from '../../../engine/layout/layout';
import type { PlacementProposal } from '../../../engine/layout/subtree-placement';
import { panBy, zoomAround, type View } from '../../../engine/viewport';

/** A point in screen (client) pixels. */
export type Point = NodePosition;

/** Dragging branches: the node under the pointer, alone or with the rest of its group. */
export interface NodeDrag {
  kind: 'nodeDrag';
  pointerId: number;
  /** The node under the pointer; its box decides drop targets. */
  id: string;
  ids: string[];
  start: Point;
  /** The latest pointer position, to re-run the frame when Alt changes. */
  pointer: Point;
  zoom: number;
  origin: NodePosition;
  layout: Layout;
  delta: NodePosition;
  proposal: PlacementProposal | null;
  target: DropTarget | null;
  /** Past the drag threshold; until then a release is a click. */
  moved: boolean;
}

/**
 * The one gesture the canvas is in. Pointer-bound gestures follow only the pointer that
 * started them; pan and pinch follow every pointer that is down.
 */
export type Gesture =
  | { kind: 'idle' }
  | NodeDrag
  /** Shift/Ctrl/⌘-drag on empty canvas selects the nodes inside a rectangle. */
  | { kind: 'marquee'; pointerId: number; start: Point; end: Point; origin: Point }
  /** `tap`: a press on empty canvas that has not moved yet. */
  | { kind: 'pan'; start: Point; view: View; tap: boolean }
  | { kind: 'pinch'; start: Point; distance: number; view: View }
  | { kind: 'resize'; pointerId: number };

export type GestureKind = Gesture['kind'];
export const IDLE: Gesture = { kind: 'idle' };

/** Gestures that hold the canvas: wheel, auto-scroll and new presses wait for them. */
export const isBusy = (gesture: Gesture) =>
  gesture.kind === 'nodeDrag' || gesture.kind === 'marquee' || gesture.kind === 'resize';

export interface Press {
  button: number;
  /** Shift, Ctrl or ⌘: extends the selection. */
  additive: boolean;
  /** The node under the pointer. */
  nodeId?: string;
  /** On that node's resize handle. */
  handle: boolean;
  /** On a button, field or link, which handles its own presses. */
  control: boolean;
  /** Pointers already down. */
  down: number;
}

/** Which gesture a press starts, given the one in progress. */
export function classifyPress(
  press: Press,
  {
    current,
    panMode,
    editingId,
  }: { current: GestureKind; panMode: boolean; editingId: string | null },
): GestureKind | 'ignore' {
  if (current === 'resize' || press.button !== 0) return 'ignore';
  if (press.handle) return press.down === 0 ? 'resize' : 'ignore';
  if (press.control) return 'ignore';
  // Clicks in the title being edited place the caret.
  if (press.nodeId !== undefined && press.nodeId === editingId) return 'ignore';
  // Modified clicks on a node toggle it in the selection when the click arrives.
  if (press.nodeId && press.additive) return 'ignore';
  if (press.down > 0) return 'pinch';
  if (panMode) return 'pan';
  if (press.nodeId) return 'nodeDrag';
  return press.additive ? 'marquee' : 'pan';
}

export const travelled = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD;

const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const startPan = (point: Point, view: View, tap: boolean): Gesture => ({
  kind: 'pan',
  start: point,
  view,
  tap,
});

export const startPinch = ([a, b]: Point[], view: View): Gesture => ({
  kind: 'pinch',
  start: midpoint(a, b),
  distance: distance(a, b),
  view,
});

/** The view while panning: the start view moved by how far the pointer went. */
export const panView = (pan: { start: Point; view: View }, point: Point) =>
  panBy(pan.view, point.x - pan.start.x, point.y - pan.start.y);

/**
 * The view while pinching: zoomed by how far the fingers spread, keeping the map point that
 * was under their first midpoint under their midpoint now. `local` converts screen points
 * to viewport ones.
 */
export function pinchView(
  pinch: { start: Point; distance: number; view: View },
  [a, b]: Point[],
  local: (point: Point) => Point,
): View {
  const ratio = pinch.distance ? distance(a, b) / pinch.distance : 1;
  return zoomAround(pinch.view, pinch.view.zoom * ratio, local(pinch.start), local(midpoint(a, b)));
}

/** The marquee rectangle relative to the viewport. */
export const marqueeRect = ({
  start,
  end,
  origin,
}: {
  start: Point;
  end: Point;
  origin: Point;
}) => ({
  x: Math.min(start.x, end.x) - origin.x,
  y: Math.min(start.y, end.y) - origin.y,
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});
