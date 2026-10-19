import type { MindMap, NodePosition } from './model';
import { updateNode } from './commands';
import { setNodePositions } from './positions';

export interface NodeSize {
  width: number;
  height: number;
}
export const MIN_NODE_WIDTH = 120;
export const MIN_NODE_HEIGHT = 56;
export const MAX_NODE_SIZE = 1200;

export function sizeValue(value: unknown, minimum: number): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= MAX_NODE_SIZE
    ? value
    : null;
}

export function clampNodeSize(size: NodeSize): NodeSize {
  return {
    width: Math.round(Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_SIZE, size.width))),
    height: Math.round(Math.max(MIN_NODE_HEIGHT, Math.min(MAX_NODE_SIZE, size.height))),
  };
}

export function resizeNode(
  map: MindMap,
  id: string,
  size: NodeSize | null,
  positions: Record<string, NodePosition> = {},
): MindMap {
  if (!Object.hasOwn(map.nodes, id)) throw new Error('노드를 찾을 수 없습니다.');
  if (
    size &&
    (sizeValue(size.width, MIN_NODE_WIDTH) === null ||
      sizeValue(size.height, MIN_NODE_HEIGHT) === null)
  )
    throw new Error('노드 크기 범위를 확인해 주세요.');
  const style = { ...map.nodes[id].style };
  if (size) Object.assign(style, size);
  else {
    delete style.width;
    delete style.height;
  }
  return setNodePositions(updateNode(map, id, { style }), positions);
}
