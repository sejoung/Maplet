import { MAX_DEPTH, MAX_NODE_COUNT, MAX_TITLE, type MindMap, type MindNode } from './model';
import { AppError, formatCount } from './errors';
import { isReservedId } from './util/ids';
import { depthOf, isDescendant, subtreeHeight } from './tree';

/** Preconditions shared by commands; each throws (or returns) a user-facing error. */
export function nodeOf(map: MindMap, id: string): MindNode {
  if (!Object.hasOwn(map.nodes, id)) throw new AppError('edit.nodeNotFound');
  return map.nodes[id];
}

export function titleOf(title: string): string {
  if (!title.trim() || title.length > MAX_TITLE)
    throw new AppError('edit.enterTitleBetween1Characters', { max: formatCount(MAX_TITLE) });
  return title;
}

export const nodeLimit = () => new AppError('edit.nodeLimit', { max: formatCount(MAX_NODE_COUNT) });
export const depthLimit = () => new AppError('common.depthLimit', { max: MAX_DEPTH });

export function assertNewId(map: MindMap, id: string) {
  if (Object.hasOwn(map.nodes, id) || isReservedId(id))
    throw new AppError('common.duplicateInvalidNodeId');
}

/** Whether `count` more nodes still fit in the document. */
export function assertRoom(map: MindMap, count: number) {
  if (Object.keys(map.nodes).length + count > MAX_NODE_COUNT) throw nodeLimit();
}

/** Why the branch `id` cannot move under `parentId`, or null when it can (or already is). */
export function moveViolation(map: MindMap, id: string, parentId: string): AppError | null {
  if (!Object.hasOwn(map.nodes, id) || !Object.hasOwn(map.nodes, parentId))
    return new AppError('edit.nodeNotFound');
  if (id === parentId || isDescendant(map, id, parentId))
    return new AppError('edit.moveCreatesCycle');
  if (map.nodes[id].parentId === null) return new AppError('edit.cannotMoveCentralNodeUnder');
  if (depthOf(map, parentId) + subtreeHeight(map, id) > MAX_DEPTH) return depthLimit();
  return null;
}
