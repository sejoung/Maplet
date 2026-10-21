import { MAX_DEPTH, MAX_NODE_COUNT, type MindMap } from './model';
import { own } from './ids';
import { decide, type MergeResolution } from './merge-values';
import { hasDuplicateRanks, rankMagnitude, renumberRanks } from './ranks';

/** Rebuild redundant child lists from placements and validate the complete tree. */
export function rebuildTree(map: MindMap): boolean {
  const nodes = Object.values(map.nodes);
  if (!nodes.length || nodes.length > MAX_NODE_COUNT) return false;
  map.roots = [];
  nodes.forEach((node) => {
    node.children = [];
  });
  for (const node of nodes) {
    if (node.parentId === null) map.roots.push(node.id);
    else if (Object.hasOwn(map.nodes, node.parentId))
      map.nodes[node.parentId].children.push(node.id);
    else return false;
  }
  const sort = (ids: string[]) => {
    ids.sort(
      (a, b) =>
        rankMagnitude(map.nodes[a].rank) - rankMagnitude(map.nodes[b].rank) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
    if (hasDuplicateRanks(map, ids)) renumberRanks(map, ids);
  };
  sort(map.roots);
  nodes.forEach((node) => sort(node.children));
  const seen = new Set<string>();
  const visit = (id: string, depth: number): boolean => {
    if (seen.has(id) || depth > MAX_DEPTH) return false;
    seen.add(id);
    return map.nodes[id].children.every((child) => visit(child, depth + 1));
  };
  if (!map.roots.every((id) => visit(id, 1)) || seen.size !== nodes.length) return false;
  if (map.roots.length > 1) map.formatVersion = 3;
  return true;
}

/** Choose only the conflicting topology component, retaining unrelated additions/edits. */
export function resolveTree(
  map: MindMap,
  base: MindMap,
  local: MindMap,
  remote: MindMap,
  resolution: MergeResolution,
) {
  const affected = new Set<string>();
  for (const node of Object.values(map.nodes)) {
    const path: string[] = [];
    let id: string | null = node.id;
    while (id !== null) {
      const cycle = path.indexOf(id);
      if (cycle !== -1) {
        path.slice(cycle).forEach((key) => affected.add(key));
        break;
      }
      path.push(id);
      if (!own(map.nodes, id) || path.length > MAX_DEPTH) {
        path.forEach((key) => affected.add(key));
        break;
      }
      id = map.nodes[id].parentId;
    }
  }
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
  const id = JSON.stringify([null, ['structure']]);
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
  for (const key of affected) {
    const node = own(chosen.nodes, key);
    if (!node) delete map.nodes[key];
    else
      map.nodes[key] = {
        ...(own(map.nodes, key) ?? node),
        parentId: node.parentId,
        rank: node.rank,
        side: node.side,
        children: [...node.children],
      };
  }
  if (!rebuildTree(map)) {
    // Both individually valid trees can exceed global limits when combined.
    // Make the larger structural decision explicit rather than losing nodes silently.
    const limitId = JSON.stringify([null, ['structure', 'document']]);
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
    map.nodes = Object.fromEntries(
      Object.values(fallback.nodes).map((node) => [
        node.id,
        {
          ...(own(map.nodes, node.id) ?? node),
          parentId: node.parentId,
          rank: node.rank,
          side: node.side,
          children: [...node.children],
        },
      ]),
    );
    map.roots = [...fallback.roots];
    map.formatVersion = fallback.formatVersion;
  }
}
