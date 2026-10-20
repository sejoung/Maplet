import type { Layout } from './layout';

export function fitLayout(
  layout: Layout,
  viewport: { width: number; height: number },
  minimumZoom = 0.15,
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
