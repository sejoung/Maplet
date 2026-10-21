import type { MindMap, MindNode } from './model';
import { own } from './ids';
import {
  equalValue,
  mergeValue,
  type MergeChoice,
  type MergeChoices,
  type MergeResolution,
} from './merge-values';
import { rebuildTree, resolveTree } from './merge-tree';
import { mergeLayout } from './merge-layout';
import { pruneConnections } from './connections';
export type { MergeChoices, MergeConflict, MergeChoice } from './merge-values';

const withoutTree = (node: MindNode) => {
  const { children: _children, ...rest } = node;
  void _children;
  return rest;
};

export interface MergeOptions {
  /** Resolve every undecided conflict to this side (conflicts are still reported). */
  prefer?: MergeChoice;
  /** Precomputed `changedNodes(base, remote)`, reused when one remote merges into many maps. */
  remoteChanges?: ReadonlySet<string>;
}

/** IDs whose node content (excluding derived child lists) differs between two maps. */
export function changedNodes(from: MindMap, to: MindMap): Set<string> {
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(from.nodes), ...Object.keys(to.nodes)])) {
    const a = own(from.nodes, id),
      b = own(to.nodes, id);
    if (!a || !b || !equalValue(withoutTree(a), withoutTree(b))) changed.add(id);
  }
  return changed;
}

/** Three-way merge. Undecided conflicts are reported; `options.prefer` also resolves them. */
export function mergeMaps(
  base: MindMap,
  local: MindMap,
  remote: MindMap,
  choices: MergeChoices = {},
  { prefer, remoteChanges }: MergeOptions = {},
) {
  const resolution: MergeResolution = { conflicts: [], choices, prefer };
  const { conflicts } = resolution;
  const nodes: Record<string, MindNode> = {};
  const ids = new Set([
    ...Object.keys(base.nodes),
    ...Object.keys(local.nodes),
    ...Object.keys(remote.nodes),
  ]);
  for (const id of ids) {
    const l = own(local.nodes, id);
    if (remoteChanges && !remoteChanges.has(id)) {
      // Unchanged remotely: the three-way rule keeps the local value as-is.
      if (l) nodes[id] = { ...l, children: [] };
      continue;
    }
    const b = own(base.nodes, id),
      r = own(remote.nodes, id);
    const merged = mergeValue(
      b && withoutTree(b),
      l && withoutTree(l),
      r && withoutTree(r),
      id,
      [],
      conflicts,
      choices,
      prefer,
    );
    if (merged) nodes[id] = { ...(merged as MindNode), children: [] };
  }
  const metadata = (map: MindMap) => {
    const { roots: _roots, nodes: _nodes, ...rest } = map;
    void _roots;
    void _nodes;
    return rest;
  };
  mergeLayout(base, local, remote, nodes, resolution);
  const merged: MindMap = {
    ...(mergeValue(
      metadata(base),
      metadata(local),
      metadata(remote),
      null,
      [],
      conflicts,
      choices,
      prefer,
    ) as MindMap),
    nodes,
    roots: [],
  };
  if (!rebuildTree(merged)) resolveTree(merged, base, local, remote, resolution);
  // Cross-links merge as one value; drop any whose ends the merged tree no longer has.
  return { map: pruneConnections(merged), conflicts };
}

export const equalMaps = (a: MindMap, b: MindMap) => equalValue(a, b);
