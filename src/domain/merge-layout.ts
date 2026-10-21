import type { MindMap, MindNode } from './model';
import { own } from './ids';
import { decide, equalValue, type MergeResolution } from './merge-values';

/** Overlapping subtree moves are resolved together, never as a partially applied drag. */
export function mergeLayout(
  base: MindMap,
  local: MindMap,
  remote: MindMap,
  nodes: Record<string, MindNode>,
  resolution: MergeResolution,
) {
  const { conflicts } = resolution;
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  for (const tree of [local, remote]) {
    const moved = new Set(
      Object.values(tree.nodes)
        .filter((node) => {
          const original = own(base.nodes, node.id);
          return original && !equalValue(original.position, node.position);
        })
        .map((node) => node.id),
    );
    for (const id of moved) {
      if (!links.has(id)) links.set(id, new Set());
      const parent = tree.nodes[id].parentId;
      if (parent && moved.has(parent)) link(id, parent);
    }
  }
  const seen = new Set<string>();
  for (const first of links.keys()) {
    if (seen.has(first)) continue;
    const group = [first];
    seen.add(first);
    for (let i = 0; i < group.length; i++)
      for (const id of links.get(group[i]) ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          group.push(id);
        }
      }
    if (group.length < 2) continue;
    const overlapping = group.some((id) => {
      const [b, l, r] = [base, local, remote].map((tree) => own(tree.nodes, id));
      return (
        b &&
        l &&
        r &&
        !equalValue(l.position, r.position) &&
        !equalValue(b.position, l.position) &&
        !equalValue(b.position, r.position)
      );
    });
    if (!overlapping) continue;
    group.sort();
    const nodeId =
      group.find(
        (id) => !group.includes((own(local.nodes, id) ?? remote.nodes[id]).parentId ?? ''),
      ) ?? group[0];
    const path = ['position', 'group'];
    const id = JSON.stringify([nodeId, path]);
    const describe = (tree: MindMap) =>
      Object.fromEntries(
        group.map((key) => [
          key,
          own(tree.nodes, key)
            ? { title: tree.nodes[key].title, position: tree.nodes[key].position }
            : null,
        ]),
      );
    for (let i = conflicts.length - 1; i >= 0; i--)
      if (
        conflicts[i].nodeId &&
        group.includes(conflicts[i].nodeId!) &&
        conflicts[i].path[0] === 'position'
      )
        conflicts.splice(i, 1);
    const side = decide(
      resolution,
      () => ({
        id,
        nodeId,
        path,
        base: describe(base),
        local: describe(local),
        remote: describe(remote),
      }),
      id,
    );
    const chosen = side === 'remote' ? remote : local;
    for (const key of group) {
      const source = own(chosen.nodes, key);
      if (own(nodes, key) && source) nodes[key].position = source.position;
    }
  }
}
