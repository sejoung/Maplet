import type { MindMap } from '../domain/model';
import type { Layout, LayoutNode } from './layout';

export interface ConnectionLine {
  from: string;
  to: string;
  path: string;
}

/** Where the line from a box's center toward `toward` leaves the box. */
function exit(box: LayoutNode, toward: { x: number; y: number }) {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = toward.x - center.x,
    dy = toward.y - center.y;
  const scale = Math.min(
    dx ? box.width / 2 / Math.abs(dx) : Infinity,
    dy ? box.height / 2 / Math.abs(dy) : Infinity,
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** A gentle arc between the borders of two boxes, bending to the left of its direction. */
export function connectionPath(from: LayoutNode, to: LayoutNode): string {
  const a = exit(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
  const b = exit(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.max(24, length * 0.2);
  const control = {
    x: (a.x + b.x) / 2 + (dy / length) * bend,
    y: (a.y + b.y) / 2 - (dx / length) * bend,
  };
  return `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`;
}

/** Cross-links whose ends are both visible in `layout`. */
export function connectionLines(map: MindMap, layout: Layout): ConnectionLine[] {
  const placed = new Map(layout.nodes.map((node) => [node.id, node]));
  return (map.connections ?? []).flatMap(({ from, to }) => {
    const a = placed.get(from),
      b = placed.get(to);
    return a && b && a !== b ? [{ from, to, path: connectionPath(a, b) }] : [];
  });
}
