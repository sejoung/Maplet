import {
  blankNode,
  MAX_DEPTH,
  type MindMap,
  type MindNode,
  type NodePosition,
  type Side,
} from '../model';
import { AppError } from '../errors';
import { own } from '../util/ids';
import { nextRank, placeRank } from '../ranks';
import { pruneConnections } from './connections';
import { assertNewId, assertRoom, depthLimit, moveViolation, nodeOf, titleOf } from '../invariants';
import { applyRanks, attachChild, editNodes, placeBranch } from '../node-edits';
import { depthOf, subtreeIds, topBranch } from '../tree';
import { topLevel } from '../selection';

export function createMap(title = 'Central topic'): MindMap {
  return {
    formatVersion: 2,
    roots: ['root'],
    nodes: { root: blankNode('root', titleOf(title), null) },
    rawExtensions: {},
    original: null,
    warnings: [],
  };
}

export function addNode(
  map: MindMap,
  parentId: string,
  id: string,
  title = 'New node',
  afterId?: string,
): MindMap {
  const parent = nodeOf(map, parentId);
  if (afterId && nodeOf(map, afterId).parentId !== parentId)
    throw new AppError('edit.selectSiblingUnderSameParent');
  assertNewId(map, id);
  assertRoom(map, 1);
  if (depthOf(map, parentId) >= MAX_DEPTH) throw depthLimit();
  const side = afterId ? map.nodes[afterId].side : parent.side;
  const edits = editNodes(map);
  edits.add(blankNode(id, titleOf(title), parentId, { side }));
  attachChild(edits, parentId, id, afterId);
  return edits.done();
}

/** Add a central topic, optionally at a map position. Several roots need MindMup v3. */
export function addRoot(map: MindMap, id: string, title: string, position?: NodePosition) {
  assertNewId(map, id);
  assertRoom(map, 1);
  const node = blankNode(id, titleOf(title), null, {
    rank: nextRank(map, map.roots, 'right'),
    position: position ? { x: position.x, y: position.y } : null,
  });
  return {
    ...map,
    formatVersion: 3 as const,
    roots: [...map.roots, id],
    nodes: { ...map.nodes, [id]: node },
  };
}

export function deleteNode(map: MindMap, id: string): MindMap {
  return deleteNodes(map, [id]);
}

/** Delete separate branches in one change; `ids` must not contain each other's descendants. */
export function deleteNodes(map: MindMap, ids: readonly string[]): MindMap {
  ids.forEach((id) => nodeOf(map, id));
  if (map.roots.every((root) => ids.includes(root)))
    throw new AppError('edit.cannotDeleteLastCentralNode');
  const edits = editNodes(map);
  let roots = map.roots;
  for (const id of ids) {
    const parentId = edits.nodes[id].parentId;
    if (parentId === null) roots = roots.filter((key) => key !== id);
    else
      edits.set(parentId, { children: edits.nodes[parentId].children.filter((key) => key !== id) });
    for (const key of subtreeIds(edits, id)) edits.remove(key);
  }
  return pruneConnections(edits.done({ roots }));
}

/** Whether `moveNode(map, id, parentId)` would succeed and change the parent. */
export const canMoveNode = (map: MindMap, id: string, parentId: string): boolean =>
  own(map.nodes, id)?.parentId !== parentId && !moveViolation(map, id, parentId);

/**
 * Parents every node in `ids` can move under, plus their shared current parent so a picker
 * can start on it. Cycles and the depth limit are excluded exactly as in `canMoveNode`.
 */
export function moveTargets(map: MindMap, ids: readonly string[]): MindNode[] {
  return Object.values(map.nodes).filter((candidate) =>
    ids.every(
      (id) => map.nodes[id]?.parentId === candidate.id || canMoveNode(map, id, candidate.id),
    ),
  );
}

/** Reparent a branch as the last child; `side` picks the side when the new parent is a root. */
export function moveNode(map: MindMap, id: string, parentId: string, side?: Side): MindMap {
  const violation = moveViolation(map, id, parentId);
  if (violation) throw violation;
  const from = map.nodes[id].parentId!;
  if (from === parentId) return map;
  const parent = map.nodes[parentId];
  const branchSide = parent.parentId === null ? (side ?? parent.side) : parent.side;
  const edits = editNodes(map);
  edits.set(from, { children: map.nodes[from].children.filter((key) => key !== id) });
  edits.set(parentId, { children: [...parent.children, id], collapsed: false });
  edits.set(id, { parentId, rank: nextRank(map, parent.children, branchSide) });
  placeBranch(edits, id, branchSide);
  return edits.done();
}

/** Reparent every selected branch under `parentId`, keeping their document order. */
export function moveNodes(
  map: MindMap,
  ids: readonly string[],
  parentId: string,
  side?: Side,
): MindMap {
  return topLevel(map, ids).reduce((current, id) => moveNode(current, id, parentId, side), map);
}

/**
 * Reparent separate branches next to `anchor`, a child of `parentId`, in their given order.
 * Unlike `moveNode`, the parent may stay the same, which reorders. The parent's children on
 * that side lose their manual positions so the new order is visible.
 */
export function insertNodes(
  map: MindMap,
  ids: readonly string[],
  parentId: string,
  anchor: { id: string; after: boolean },
): MindMap {
  const parent = nodeOf(map, parentId);
  if (nodeOf(map, anchor.id).parentId !== parentId || ids.includes(anchor.id))
    throw new AppError('edit.selectSiblingUnderSameParent');
  for (const id of ids) {
    const violation = moveViolation(map, id, parentId);
    if (violation) throw violation;
  }
  const side = parent.parentId === null ? map.nodes[anchor.id].side : parent.side;
  const edits = editNodes(map);
  for (const id of ids) {
    const from = edits.nodes[id].parentId!;
    edits.set(from, { children: edits.nodes[from].children.filter((key) => key !== id) });
  }
  const siblings = [...edits.nodes[parentId].children];
  let index = siblings.indexOf(anchor.id) + (anchor.after ? 1 : 0);
  for (const id of ids) {
    siblings.splice(index++, 0, id);
    edits.set(id, { parentId });
    placeBranch(edits, id, side);
    applyRanks(edits, placeRank(edits, siblings, id));
  }
  edits.set(parentId, { children: siblings, collapsed: false });
  for (const id of siblings) if (edits.nodes[id].side === side) placeBranch(edits, id, side);
  return edits.done();
}

/** Swap a node with its previous (-1) or next (1) sibling on the same side. */
export function moveSibling(map: MindMap, id: string, offset: -1 | 1): MindMap {
  const node = nodeOf(map, id);
  if (node.parentId === null) return map;
  const siblings = map.nodes[node.parentId].children;
  const sameSide = siblings.filter((key) => map.nodes[key].side === node.side);
  const neighbor = sameSide[sameSide.indexOf(id) + offset];
  if (!neighbor) return map;
  const edits = editNodes(map);
  edits.set(node.parentId, {
    children: siblings.map((key) => (key === id ? neighbor : key === neighbor ? id : key)),
  });
  edits.set(id, { rank: map.nodes[neighbor].rank });
  edits.set(neighbor, { rank: node.rank });
  // Manually placed branches would otherwise keep their old spots and hide the new order.
  for (const key of [...subtreeIds(map, id), ...subtreeIds(map, neighbor)])
    edits.set(key, { position: null });
  return edits.done();
}

/**
 * Move the top-level branch holding `id` to `side`, ranked after the branches already there.
 * A central topic has no side to change.
 */
export function setBranchSide(map: MindMap, id: string, side: Side): MindMap {
  const node = nodeOf(map, id);
  if (node.side === side) return map;
  if (node.parentId === null) throw new AppError('edit.rootSideFixed');
  const branch = topBranch(map, id);
  const rootId = map.nodes[branch].parentId!;
  const edits = editNodes(map);
  edits.set(branch, {
    rank: nextRank(
      map,
      map.nodes[rootId].children.filter((key) => key !== branch),
      side,
    ),
  });
  placeBranch(edits, branch, side);
  return edits.done();
}
