import type { MindMap, NodePosition } from '../domain/model';

/** An axis-aligned rectangle in map coordinates. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest box around `boxes` (at least one), grown by `pad` on every side. */
export function boundsOf(boxes: readonly Box[], pad = 0): Box {
  const x = Math.min(...boxes.map((box) => box.x)) - pad;
  const y = Math.min(...boxes.map((box) => box.y)) - pad;
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) + pad - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) + pad - y,
  };
}

/**
 * Whether two boxes overlap once `margin` is kept between them. Touching edges do not
 * overlap; a negative margin tolerates that much overlap.
 */
export const intersects = (a: Box, b: Box, margin = 0) =>
  a.x < b.x + b.width + margin &&
  a.x + a.width > b.x - margin &&
  a.y < b.y + b.height + margin &&
  a.y + a.height > b.y - margin;

/** Every node's current spot: its laid-out box where shown, else its saved manual position. */
export function seedPositions(
  map: MindMap,
  placed: readonly (NodePosition & { id: string })[],
): Record<string, NodePosition> {
  return Object.fromEntries([
    ...Object.values(map.nodes).flatMap((node) =>
      node.position ? [[node.id, node.position] as const] : [],
    ),
    ...placed.map((node) => [node.id, { x: node.x, y: node.y }] as const),
  ]);
}
