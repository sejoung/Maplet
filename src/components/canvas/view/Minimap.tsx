import { memo, useRef, type PointerEvent } from 'react';
import type { MindMap } from '../../../domain/model';
import { branchLine, nodeBorder, readableBackground } from '../../../domain/style/node-colors';
import { connectionLines } from '../../../engine/connections';
import { boundsOf } from '../../../engine/geometry';
import type { Layout } from '../../../engine/layout/layout';
import { DASHES } from '../../../engine/render-metrics';
import { visibleRect, type Size, type View } from '../../../engine/viewport';

const WIDTH = 180;
const HEIGHT = 120;
const PAD = 6;
/** Boxes this small on screen would vanish, so they keep a minimum drawn size. */
const MIN_BOX_PX = 2;
const NODE_RADIUS = 8;

interface Placement {
  scale: number;
  x: number;
  y: number;
}

/**
 * The map drawn small: connectors, cross-links and node boxes in their own colors, with the
 * selection and find results marked and the viewport outlined. Pressing or dragging on it
 * centers the canvas there; keyboard users navigate nodes directly instead.
 */
export function Minimap({
  map,
  layout,
  view,
  size,
  selection,
  matches,
  onCenter,
}: {
  map: MindMap;
  layout: Layout;
  view: View;
  size: Size;
  selection: readonly string[];
  matches?: ReadonlySet<string>;
  onCenter(point: { x: number; y: number }): void;
}) {
  const pressed = useRef(false);
  if (!layout.nodes.length) return null;
  const bounds = boundsOf(layout.nodes);
  const scale = Math.min((WIDTH - 2 * PAD) / bounds.width, (HEIGHT - 2 * PAD) / bounds.height);
  const place: Placement = {
    scale,
    x: PAD + (WIDTH - 2 * PAD - bounds.width * scale) / 2 - bounds.x * scale,
    y: PAD + (HEIGHT - 2 * PAD - bounds.height * scale) / 2 - bounds.y * scale,
  };
  const center = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCenter({
      x: (event.clientX - rect.left - place.x) / scale,
      y: (event.clientY - rect.top - place.y) / scale,
    });
  };
  const shown = visibleRect(view, size);
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
      <MinimapMap
        map={map}
        layout={layout}
        selection={selection}
        matches={matches}
        scale={place.scale}
        x={place.x}
        y={place.y}
      />
      <rect
        className="minimap-view"
        x={place.x + shown.x * scale}
        y={place.y + shown.y * scale}
        width={shown.width * scale}
        height={shown.height * scale}
        rx={2}
      />
    </svg>
  );
}

/**
 * The drawing itself, in map coordinates under one transform. It is memoized on the map and
 * its placement, so panning and zooming only move the viewport frame. Strokes do not scale,
 * so lines stay crisp at any map size.
 */
const MinimapMap = memo(function MinimapMap({
  map,
  layout,
  selection,
  matches,
  scale,
  x,
  y,
}: {
  map: MindMap;
  layout: Layout;
  selection: readonly string[];
  matches?: ReadonlySet<string>;
} & Placement) {
  const chosen = new Set(selection);
  const minimum = MIN_BOX_PX / scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {layout.edges.map((edge) => {
        const line = branchLine(map, edge.to);
        return (
          <path
            key={edge.to}
            className="minimap-edge"
            d={edge.path}
            style={line.color ? { stroke: line.color } : undefined}
            strokeDasharray={DASHES[line.style]}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {connectionLines(map, layout).map((link) => (
        <path
          key={`${link.from}>${link.to}`}
          className="minimap-link"
          d={link.path}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {layout.nodes.map((box) => {
        const node = map.nodes[box.id];
        const background = readableBackground(node.style.background, '');
        const marked = chosen.has(box.id) || Boolean(matches?.has(box.id));
        // Selection and find marks outrank a chosen border color, as on the canvas.
        const border = marked ? null : nodeBorder(node.style);
        const className = [
          'minimap-node',
          node.parentId === null && 'root',
          chosen.has(box.id) && 'selected',
          !chosen.has(box.id) && matches?.has(box.id) && 'match',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <rect
            key={box.id}
            data-minimap-node={box.id}
            className={className}
            x={box.x}
            y={box.y}
            width={Math.max(minimum, box.width)}
            height={Math.max(minimum, box.height)}
            rx={NODE_RADIUS}
            style={{ fill: background || undefined, stroke: border ?? undefined }}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
});
