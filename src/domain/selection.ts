import type { JsonObject, MindMap, MindNode, Side } from './model';
import { moveNode, updateNode } from './commands';
import { equalJson } from './json';

/** Selected nodes that are not inside another selected branch, in document order. */
export function topLevel(map: MindMap, ids: readonly string[]): string[] {
  const chosen = new Set(ids.filter((id) => Object.hasOwn(map.nodes, id)));
  const result: string[] = [];
  const visit = (id: string) => {
    if (chosen.has(id)) result.push(id);
    else map.nodes[id].children.forEach(visit);
  };
  if (chosen.size) map.roots.forEach(visit);
  return result;
}

/** Selected nodes that still exist and are not hidden inside a collapsed branch. */
export function visibleSelection(map: MindMap, ids: readonly string[]): string[] {
  return ids.filter((id) => {
    if (!Object.hasOwn(map.nodes, id)) return false;
    for (let parent = map.nodes[id].parentId; parent; parent = map.nodes[parent].parentId)
      if (map.nodes[parent].collapsed) return false;
    return true;
  });
}

/** Whether deleting the selected branches would leave at least one root. */
export function canDeleteNodes(map: MindMap, ids: readonly string[]): boolean {
  const removed = new Set(topLevel(map, ids));
  return removed.size > 0 && map.roots.some((root) => !removed.has(root));
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

type NodePatch = Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'collapsed' | 'side'>>;

/**
 * Apply a patch made for `primary` to every selected node. Style changes carry only the
 * properties that differ from the primary node's style, so other formatting is kept.
 */
export function updateNodes(
  map: MindMap,
  ids: readonly string[],
  primary: string,
  patch: NodePatch,
): MindMap {
  if (ids.length < 2 || patch.notes !== undefined || patch.links !== undefined)
    return updateNode(map, primary, patch);
  const from = map.nodes[primary]?.style ?? {};
  return ids.reduce((current, id) => {
    const node = current.nodes[id];
    if (!node || (patch.side && node.parentId === null)) return current;
    const next: NodePatch = { ...patch };
    if (patch.style) next.style = restyle(node.style, from, patch.style);
    return updateNode(current, id, next);
  }, map);
}

function restyle(style: JsonObject, from: JsonObject, to: JsonObject): JsonObject {
  const result = { ...style };
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (equalJson(from[key], to[key])) continue;
    if (Object.hasOwn(to, key)) result[key] = to[key];
    else delete result[key];
  }
  return result;
}
