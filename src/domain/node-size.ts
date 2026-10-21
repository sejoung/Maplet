import { AppError } from './errors';
import type { MindMap, NodePosition } from './model';
import { updateNode } from './commands';
import { setNodePositions } from './positions';

export const MIN_NODE_WIDTH = 56;
export const MIN_NODE_HEIGHT = 36;
export const MAX_NODE_SIZE = 1200;
export const NODE_PADDING_X = 12;
export const NODE_PADDING_Y = 6;
export const NODE_BORDER = 1;

export function sizeValue(value: unknown, minimum: number): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= MAX_NODE_SIZE
    ? value
    : null;
}

export const clampNodeWidth = (width: number) =>
  Math.round(Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_SIZE, width)));

export function resizeNode(
  map: MindMap,
  id: string,
  width: number | null,
  positions: Record<string, NodePosition> = {},
): MindMap {
  if (!Object.hasOwn(map.nodes, id)) throw new AppError('edit.nodeNotFound');
  if (width !== null && sizeValue(width, MIN_NODE_WIDTH) === null)
    throw new AppError('edit.checkNodeSizeLimits');
  const style = { ...map.nodes[id].style };
  if (width !== null) style.width = width;
  else delete style.width;
  delete style.height;
  return setNodePositions(updateNode(map, id, { style }), positions);
}
