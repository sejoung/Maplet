import { MAX_DEPTH, MAX_NODE_COUNT, type MindMap, type MindNode } from '../model';
import { own } from '../util/ids';
import { conflictId, decide, type MergeResolution } from './merge-values';
import { hasDuplicateRanks, rankMagnitude, renumberRanks } from '../ranks';
import { editNodes } from '../node-edits';
import { lineage } from '../tree';

/**
 * The map with child lists and roots rebuilt from each node's placement, or null when that
 * is no valid tree within the document limits.
 */
export function rebuildTree(map: MindMap): MindMap | null {
  const nodes = Object.values(map.nodes);
  if (!nodes.length || nodes.length > MAX_NODE_COUNT) return null;
  const children = new Map<string | null, string[]>([[null, []]]);
  nodes.forEach((node) => children.set(node.id, []));
  for (const node of nodes) {
    const siblings = children.get(node.parentId);
    if (!siblings) return null;
    siblings.push(node.id);
  }
  const ranks: Record<string, string> = {};
  for (const ids of children.values()) {
    ids.sort(
      (a, b) =>
        rankMagnitude(map.nodes[a].rank) - rankMagnitude(map.nodes[b].rank) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
    if (hasDuplicateRanks(map, ids)) Object.assign(ranks, renumberRanks(map, ids));
  }
  const roots = children.get(null)!;
  const seen = new Set<string>();
  const visit = (id: string, depth: number): boolean => {
    if (seen.has(id) || depth > MAX_DEPTH) return false;
    seen.add(id);
    return children.get(id)!.every((child) => visit(child, depth + 1));
  };
  if (!roots.every((id) => visit(id, 1)) || seen.size !== nodes.length) return null;
  const edits = editNodes(map);
  for (const node of nodes)
    edits.set(node.id, { children: children.get(node.id)!, rank: ranks[node.id] ?? node.rank });
  return edits.done({ roots, ...(roots.length > 1 && { formatVersion: 3 as const }) });
}

/** `node` moved to where `placed` sits in another version of the tree. */
const withPlacement = (node: MindNode, placed: MindNode): MindNode => ({
  ...node,
  parentId: placed.parentId,
  rank: placed.rank,
  side: placed.side,
  children: [...placed.children],
});

/** Nodes on a cycle or a broken or too deep parent chain, as a merge can produce them. */
function brokenNodes(map: MindMap): Set<string> {
  const broken = new Set<string>();
  for (const node of Object.values(map.nodes)) {
    const path: string[] = [];
    for (const id of lineage(map, node.id)) {
      const cycle = path.indexOf(id);
      if (cycle !== -1) {
        path.slice(cycle).forEach((key) => broken.add(key));
        break;
      }
      path.push(id);
      if (!own(map.nodes, id) || path.length > MAX_DEPTH) {
        path.forEach((key) => broken.add(key));
        break;
      }
    }
  }
  return broken;
}

/** Choose only the conflicting topology component, retaining unrelated additions/edits. */
export function resolveTree(
  map: MindMap,
  base: MindMap,
  local: MindMap,
  remote: MindMap,
  resolution: MergeResolution,
): MindMap {
  const affected = brokenNodes(map);
  const maps = [base, local, remote];
  if (!Object.keys(map.nodes).length || Object.keys(map.nodes).length > MAX_NODE_COUNT)
    maps.forEach((tree) => Object.keys(tree.nodes).forEach((id) => affected.add(id)));
  // Parent deletion and descendants must be decided together.
  const descendants = new Map<string, Set<string>>();
  for (const tree of [...maps, map])
    for (const node of Object.values(tree.nodes)) {
      if (node.parentId) {
        if (!descendants.has(node.parentId)) descendants.set(node.parentId, new Set());
        descendants.get(node.parentId)!.add(node.id);
      }
    }
  const pending = [...affected];
  for (let index = 0; index < pending.length; index++)
    for (const id of descendants.get(pending[index]) ?? []) {
      if (!affected.has(id)) {
        affected.add(id);
        pending.push(id);
      }
    }
  const id = conflictId(null, ['structure']);
  const describe = (tree: MindMap) =>
    Object.fromEntries(
      [...affected].map((key) => [
        key,
        own(tree.nodes, key)
          ? {
              title: tree.nodes[key].title,
              parentId: tree.nodes[key].parentId,
              rank: tree.nodes[key].rank,
            }
          : null,
      ]),
    );
  const side = decide(
    resolution,
    () => ({
      id,
      nodeId: null,
      path: ['structure'],
      base: describe(base),
      local: describe(local),
      remote: describe(remote),
    }),
    id,
  );
  const chosen = side === 'remote' ? remote : local;
  const edits = editNodes(map);
  for (const key of affected) {
    const node = own(chosen.nodes, key);
    if (!node) edits.remove(key);
    else edits.add(withPlacement(own(map.nodes, key) ?? node, node));
  }
  const attempt = edits.done();
  const rebuilt = rebuildTree(attempt);
  if (rebuilt) return rebuilt;
  // Both individually valid trees can exceed global limits when combined.
  // Make the larger structural decision explicit rather than losing nodes silently.
  const limitId = conflictId(null, ['structure', 'document']);
  const fallbackSide = decide(
    resolution,
    () => ({
      id: limitId,
      nodeId: null,
      path: ['structure', 'document'],
      base: base.roots,
      local: Object.keys(local.nodes),
      remote: Object.keys(remote.nodes),
    }),
    limitId,
  );
  const fallback = fallbackSide === 'remote' ? remote : local;
  return {
    ...attempt,
    nodes: Object.fromEntries(
      Object.values(fallback.nodes).map((node) => [
        node.id,
        withPlacement(own(attempt.nodes, node.id) ?? node, node),
      ]),
    ),
    roots: [...fallback.roots],
    formatVersion: fallback.formatVersion,
  };
}
