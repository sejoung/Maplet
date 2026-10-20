import { MAX_DEPTH, MAX_NODE_COUNT, type MindMap } from './model';
import type { MergeChoices, MergeConflict } from './merge-values';

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
        Math.abs(Number(map.nodes[a].rank)) - Math.abs(Number(map.nodes[b].rank)) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
    const ranks = ids.map((id) => map.nodes[id].rank);
    if (new Set(ranks).size !== ranks.length)
      ids.forEach((id, index) => {
        map.nodes[id].rank = String((index + 1) * (map.nodes[id].side === 'left' ? -1 : 1));
      });
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
  conflicts: MergeConflict[],
  choices: MergeChoices,
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
      if (!map.nodes[id] || path.length > MAX_DEPTH) {
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
        tree.nodes[key]
          ? {
              title: tree.nodes[key].title,
              parentId: tree.nodes[key].parentId,
              rank: tree.nodes[key].rank,
            }
          : null,
      ]),
    );
  if (!choices[id])
    conflicts.push({
      id,
      nodeId: null,
      path: ['structure'],
      base: describe(base),
      local: describe(local),
      remote: describe(remote),
    });
  const chosen = choices[id] === 'remote' ? remote : local;
  for (const key of affected) {
    const node = chosen.nodes[key];
    if (!node) delete map.nodes[key];
    else
      map.nodes[key] = {
        ...(map.nodes[key] ?? node),
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
    if (!choices[limitId])
      conflicts.push({
        id: limitId,
        nodeId: null,
        path: ['structure', 'document'],
        base: base.roots,
        local: Object.keys(local.nodes),
        remote: Object.keys(remote.nodes),
      });
    const fallback = choices[limitId] === 'remote' ? remote : local;
    map.nodes = Object.fromEntries(
      Object.values(fallback.nodes).map((node) => [
        node.id,
        {
          ...(map.nodes[node.id] ?? node),
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
