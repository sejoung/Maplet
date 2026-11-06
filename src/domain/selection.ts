import type { MindMap } from './model';
import { ancestors } from './tree';

/** Queries about a selection; the commands that act on one live in `commands`. */

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

const hidden = (map: MindMap, id: string) =>
  ancestors(map, id).some((parent) => map.nodes[parent].collapsed);

/** Selected nodes that still exist and are not hidden inside a collapsed branch. */
export const visibleSelection = (map: MindMap, ids: readonly string[]): string[] =>
  ids.filter((id) => Object.hasOwn(map.nodes, id) && !hidden(map, id));

/** Nearest ancestor-or-self of `id` that is not hidden in a collapsed branch. */
export const visibleAncestor = (map: MindMap, id: string): string =>
  ancestors(map, id)
    .filter((parent) => map.nodes[parent].collapsed)
    .at(-1) ?? id;

/** Whether deleting the selected branches would leave at least one root. */
export function canDeleteNodes(map: MindMap, ids: readonly string[]): boolean {
  const removed = new Set(topLevel(map, ids));
  return removed.size > 0 && map.roots.some((root) => !removed.has(root));
}

/** What to select once `ids` are deleted: the first one's parent, or a remaining root. */
export const fallbackAfterDelete = (map: MindMap, ids: readonly string[]): string =>
  map.nodes[ids[0]].parentId ?? map.roots.find((id) => !ids.includes(id))!;

/** What the node commands may do for `id` with `selection`; menus enable their items from it. */
export interface NodeCapabilities {
  /** Several nodes are selected: branch commands act on all of them, order commands are off. */
  group: boolean;
  canAddSibling: boolean;
  canDelete: boolean;
  /** At least one selected branch is not a root, so it can be duplicated or reparented. */
  canMoveBranches: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Some selected non-root branch sits on the other side. */
  canPlace: Record<'left' | 'right', boolean>;
  hasChildren: boolean;
}

export function nodeCapabilities(
  map: MindMap,
  id: string,
  selection: readonly string[] = [id],
): NodeCapabilities {
  const node = map.nodes[id];
  const root = node.parentId === null;
  const group = selection.length > 1;
  const branches = (group ? topLevel(map, selection) : [id]).filter(
    (key) => map.nodes[key].parentId !== null,
  );
  // Order is among siblings on the same side of the parent, as drawn.
  const siblings = root
    ? []
    : map.nodes[node.parentId!].children.filter((key) => map.nodes[key].side === node.side);
  const index = siblings.indexOf(id);
  const elsewhere = (side: 'left' | 'right') =>
    branches.some((key) => map.nodes[key].side !== side);
  return {
    group,
    canAddSibling: !root,
    canDelete: canDeleteNodes(map, group ? selection : [id]),
    canMoveBranches: branches.length > 0,
    canMoveUp: !group && index > 0,
    canMoveDown: !group && !root && index < siblings.length - 1,
    canPlace: { left: elsewhere('left'), right: elsewhere('right') },
    hasChildren: node.children.length > 0,
  };
}
