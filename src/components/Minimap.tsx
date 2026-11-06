import { useRef, type PointerEvent } from 'react';
import { boundsOf } from '../engine/geometry';
import type { Layout } from '../engine/layout';
import { visibleRect, type Size, type View } from '../engine/viewport';

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
  view: View;
  size: Size;
  onCenter(point: { x: number; y: number }): void;
}) {
  const pressed = useRef(false);
  if (!layout.nodes.length) return null;
  const bounds = boundsOf(layout.nodes);
  const scale = Math.min((WIDTH - 2 * PAD) / bounds.width, (HEIGHT - 2 * PAD) / bounds.height);
  const offset = {
    x: PAD + (WIDTH - 2 * PAD - bounds.width * scale) / 2 - bounds.x * scale,
    y: PAD + (HEIGHT - 2 * PAD - bounds.height * scale) / 2 - bounds.y * scale,
  };
  const center = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCenter({
      x: (event.clientX - rect.left - offset.x) / scale,
      y: (event.clientY - rect.top - offset.y) / scale,
    });
  };
  const shown = visibleRect(view, size);
  const frame = {
    x: offset.x + shown.x * scale,
    y: offset.y + shown.y * scale,
    width: shown.width * scale,
    height: shown.height * scale,
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
