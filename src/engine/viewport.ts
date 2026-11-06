import type { NodePosition } from '../domain/model';
import { clampZoom } from './layout/fit-layout';
import type { Box } from './geometry';

/** Pan and zoom of the canvas: map point `p` shows at `p * zoom + (x, y)` in the viewport. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}
export interface Size {
  width: number;
  height: number;
}

/**
 * A newly opened map is never fitted below this zoom, so its text stays readable; it is
 * also the view before the first fit.
 */
export const MIN_FIT_ZOOM = 0.85;
/** Zoom factor of one zoom-in or zoom-out step. */
export const ZOOM_STEP = 1.2;
/** How close a selected node may come to the viewport edge before the view follows it. */
export const REVEAL_MARGIN = 40;
/** The bottom keeps more room: the drag hint and the minimap sit there. */
export const REVEAL_BOTTOM_MARGIN = 90;
/** Wheel zoom per pixel of scroll; exponential so zooming in and out feel symmetric. */
const WHEEL_ZOOM_RATE = 0.008;

/** Map coordinates of a point given relative to the viewport's top-left corner. */
export const toMapPoint = (view: View, point: NodePosition): NodePosition => ({
  x: (point.x - view.x) / view.zoom,
  y: (point.y - view.y) / view.zoom,
});

/** Map coordinates of a rectangle given relative to the viewport. */
export const toMapRect = (view: View, rect: Box): Box => ({
  ...toMapPoint(view, rect),
  width: rect.width / view.zoom,
  height: rect.height / view.zoom,
});

/** The part of the map the viewport shows. */
export const visibleRect = (view: View, size: Size): Box =>
  toMapRect(view, { x: 0, y: 0, ...size });

/**
 * Zoom to `zoom` (clamped) so the map point under `anchor` lands at `to`, both relative to
 * the viewport. Wheel and button zoom keep it in place; a pinch also follows its midpoint.
 */
export function zoomAround(view: View, zoom: number, anchor: NodePosition, to = anchor): View {
  const next = clampZoom(zoom);
  return {
    zoom: next,
    x: to.x - ((anchor.x - view.x) * next) / view.zoom,
    y: to.y - ((anchor.y - view.y) * next) / view.zoom,
  };
}

export const panBy = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x + dx,
  y: view.y + dy,
});

/** Keep the zoom and put map point `point` at the middle of the viewport. */
export const centerOn = (view: View, point: NodePosition, size: Size): View => ({
  ...view,
  x: size.width / 2 - point.x * view.zoom,
  y: size.height / 2 - point.y * view.zoom,
});

/**
 * Center `rect` when its middle sits outside the viewport's comfortable area; otherwise
 * return `view` itself, so a state update can bail out.
 */
export function revealRect(view: View, rect: Box, size: Size): View {
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const x = view.x + middle.x * view.zoom;
  const y = view.y + middle.y * view.zoom;
  const inside =
    x >= REVEAL_MARGIN &&
    x <= size.width - REVEAL_MARGIN &&
    y >= REVEAL_MARGIN &&
    y <= size.height - REVEAL_BOTTOM_MARGIN;
  return inside ? view : centerOn(view, middle, size);
}

export const wheelZoomFactor = (deltaY: number) => Math.exp(-deltaY * WHEEL_ZOOM_RATE);
