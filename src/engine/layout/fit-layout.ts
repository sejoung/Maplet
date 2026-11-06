import type { Layout } from './layout';
import { boundsOf } from '../geometry';

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 2.5;
/** Room left around a fitted map, split between both sides. */
const VIEWPORT_PADDING = 48;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export function fitLayout(
  layout: Layout,
  viewport: { width: number; height: number },
  minimumZoom = MIN_ZOOM,
) {
  const { x: minX, y: minY, width, height } = boundsOf(layout.nodes);
  // Padding belongs to the viewport: SVG export margins must not shrink text twice.
  const zoom = Math.max(
    minimumZoom,
    Math.min(
      1,
      (viewport.width - VIEWPORT_PADDING) / width,
      (viewport.height - VIEWPORT_PADDING) / height,
    ),
  );
  return {
    zoom,
    x: (viewport.width - width * zoom) / 2 - minX * zoom,
    y: (viewport.height - height * zoom) / 2 - minY * zoom,
  };
}
