import { AppError } from './errors';
import type { MindMap, NodePosition } from './model';
import { editNodes } from './node-edits';
import { subtreeIds } from './tree';

export function isNodePosition(value: unknown): value is NodePosition {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<NodePosition>;
  return (
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= 1_000_000 &&
    Math.abs(point.y) <= 1_000_000
  );
}

export function setNodePositions(map: MindMap, positions: Record<string, NodePosition>): MindMap {
  for (const [id, point] of Object.entries(positions)) {
    if (!Object.hasOwn(map.nodes, id)) throw new AppError('edit.nodeNotFound');
    if (!isNodePosition(point)) throw new AppError('edit.nodePositionsMustFiniteCoordinates');
  }
  const edits = editNodes(map);
  for (const [id, point] of Object.entries(positions)) {
    const { position } = map.nodes[id];
    if (position?.x !== point.x || position.y !== point.y)
      edits.set(id, { position: { x: point.x, y: point.y } });
  }
  return edits.done();
}

export function positionsForSubtreeMove(
  map: MindMap,
  positions: Record<string, NodePosition>,
  id: string,
  target: NodePosition,
): Record<string, NodePosition> {
  if (!Object.hasOwn(map.nodes, id) || !positions[id])
    throw new AppError('edit.couldNotFindPositionNode');
  const dx = target.x - positions[id].x;
  const dy = target.y - positions[id].y;
  const moved = subtreeIds(map, id).flatMap((key) => {
    const point = positions[key] ?? map.nodes[key].position;
    return point ? [[key, { x: point.x + dx, y: point.y + dy }] as const] : [];
  });
  return { ...positions, ...Object.fromEntries(moved) };
}

export function resetNodePositions(map: MindMap): MindMap {
  if (!Object.values(map.nodes).some((node) => node.position !== null)) return map;
  return {
    ...map,
    nodes: Object.fromEntries(
      Object.entries(map.nodes).map(([id, node]) => [
        id,
        node.position === null ? node : { ...node, position: null },
      ]),
    ),
  };
}
