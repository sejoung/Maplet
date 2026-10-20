import type { MindMap, MindNode } from './model';
import { equalValue, mergeValue, type MergeChoices, type MergeConflict } from './merge-values';
import { rebuildTree, resolveTree } from './merge-tree';
import { mergeLayout } from './merge-layout';
export type { MergeChoices, MergeConflict, MergeChoice } from './merge-values';

const withoutTree = (node: MindNode) => {
  const { children: _children, ...rest } = node;
  void _children;
  return rest;
};

export function mergeMaps(
  base: MindMap,
  local: MindMap,
  remote: MindMap,
  choices: MergeChoices = {},
) {
  const conflicts: MergeConflict[] = [];
  const nodes: Record<string, MindNode> = {};
  const ids = new Set([
    ...Object.keys(base.nodes),
    ...Object.keys(local.nodes),
    ...Object.keys(remote.nodes),
  ]);
  for (const id of ids) {
    const b = base.nodes[id],
      l = local.nodes[id],
      r = remote.nodes[id];
    const merged = mergeValue(
      b && withoutTree(b),
      l && withoutTree(l),
      r && withoutTree(r),
      id,
      [],
      conflicts,
      choices,
    );
    if (merged) nodes[id] = { ...(merged as MindNode), children: [] };
  }
  const metadata = (map: MindMap) => {
    const { roots: _roots, nodes: _nodes, ...rest } = map;
    void _roots;
    void _nodes;
    return rest;
  };
  mergeLayout(base, local, remote, nodes, conflicts, choices);
  const merged: MindMap = {
    ...(mergeValue(
      metadata(base),
      metadata(local),
      metadata(remote),
      null,
      [],
      conflicts,
      choices,
    ) as MindMap),
    nodes,
    roots: [],
  };
  if (!rebuildTree(merged)) resolveTree(merged, base, local, remote, conflicts, choices);
  return { map: merged, conflicts };
}

export const equalMaps = (a: MindMap, b: MindMap) => equalValue(a, b);
