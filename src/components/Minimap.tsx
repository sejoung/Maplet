import { useRef, type PointerEvent } from 'react';
import type { Layout } from '../engine/layout';
import type { CanvasView } from './canvas-types';

const WIDTH = 180;
const HEIGHT = 120;
const PAD = 6;

/**
 * An overview of every visible node with the current viewport outlined. Pressing or dragging
 * on it centers the canvas there; keyboard users navigate nodes directly instead.
 */
export function Minimap({
  layout,
  view,
  size,
  onCenter,
}: {
  layout: Layout;
  view: CanvasView;
  size: { width: number; height: number };
  onCenter(point: { x: number; y: number }): void;
}) {
  const pressed = useRef(false);
  if (!layout.nodes.length) return null;
  const minX = Math.min(...layout.nodes.map((node) => node.x));
  const minY = Math.min(...layout.nodes.map((node) => node.y));
  const maxX = Math.max(...layout.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...layout.nodes.map((node) => node.y + node.height));
  const scale = Math.min((WIDTH - 2 * PAD) / (maxX - minX), (HEIGHT - 2 * PAD) / (maxY - minY));
  const offset = {
    x: PAD + (WIDTH - 2 * PAD - (maxX - minX) * scale) / 2 - minX * scale,
    y: PAD + (HEIGHT - 2 * PAD - (maxY - minY) * scale) / 2 - minY * scale,
  };
  const center = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCenter({
      x: (event.clientX - rect.left - offset.x) / scale,
      y: (event.clientY - rect.top - offset.y) / scale,
    });
  };
  const frame = {
    x: offset.x + (-view.x / view.zoom) * scale,
    y: offset.y + (-view.y / view.zoom) * scale,
    width: (size.width / view.zoom) * scale,
    height: (size.height / view.zoom) * scale,
  };
  return (
    <svg
      className="minimap"
      data-minimap
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        pressed.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        center(event);
      }}
      onPointerMove={(event) => {
        if (pressed.current) center(event);
      }}
      onPointerUp={(event) => {
        pressed.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {layout.nodes.map((node) => (
        <rect
          key={node.id}
          x={offset.x + node.x * scale}
          y={offset.y + node.y * scale}
          width={Math.max(2, node.width * scale)}
          height={Math.max(2, node.height * scale)}
          rx={1.5}
        />
      ))}
      <rect className="minimap-view" {...frame} rx={2} />
    </svg>
  );
}
