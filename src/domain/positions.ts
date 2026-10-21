import { AppError } from './errors';
import type { MindMap, NodePosition } from './model';

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
    if (!Object.hasOwn(map.nodes, id)) throw new AppError('노드를 찾을 수 없습니다.');
    if (!isNodePosition(point))
      throw new AppError('노드 위치는 ±1,000,000 범위의 유한한 좌표여야 합니다.');
  }
  let nodes = map.nodes;
  for (const [id, point] of Object.entries(positions)) {
    const node = nodes[id];
    if (node.position?.x === point.x && node.position.y === point.y) continue;
    if (nodes === map.nodes) nodes = { ...nodes };
    nodes[id] = { ...node, position: { x: point.x, y: point.y } };
  }
  return nodes === map.nodes ? map : { ...map, nodes };
}

export function positionsForSubtreeMove(
  map: MindMap,
  positions: Record<string, NodePosition>,
  id: string,
  target: NodePosition,
): Record<string, NodePosition> {
  if (!Object.hasOwn(map.nodes, id) || !positions[id])
    throw new AppError('이동할 노드의 위치를 찾을 수 없습니다.');
  const dx = target.x - positions[id].x;
  const dy = target.y - positions[id].y;
  const result = { ...positions };
  const translate = (key: string) => {
    const node = map.nodes[key];
    const point = positions[key] ?? node.position;
    if (point) result[key] = { x: point.x + dx, y: point.y + dy };
    node.children.forEach(translate);
  };
  translate(id);
  return result;
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
