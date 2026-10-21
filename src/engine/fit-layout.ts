import type { Layout } from './layout';

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 2.5;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export function fitLayout(
  layout: Layout,
  viewport: { width: number; height: number },
  minimumZoom = MIN_ZOOM,
) {
  const minX = Math.min(...layout.nodes.map((node) => node.x));
  const minY = Math.min(...layout.nodes.map((node) => node.y));
  const width = Math.max(...layout.nodes.map((node) => node.x + node.width)) - minX;
  const height = Math.max(...layout.nodes.map((node) => node.y + node.height)) - minY;
  // Padding belongs to the viewport: SVG export margins must not shrink text twice.
  const zoom = Math.max(
    minimumZoom,
    Math.min(1, (viewport.width - 48) / width, (viewport.height - 48) / height),
  );
  return {
    zoom,
    x: (viewport.width - width * zoom) / 2 - minX * zoom,
    y: (viewport.height - height * zoom) / 2 - minY * zoom,
  };
}
