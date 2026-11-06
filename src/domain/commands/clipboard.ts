import {
  blankNode,
  MAX_DEPTH,
  MAX_NODE_COUNT,
  MAX_TITLE,
  type MindMap,
  type MindNode,
} from '../model';
import { AppError } from '../errors';
import { isReservedId } from '../util/ids';
import { assertRoom, depthLimit, nodeLimit } from '../invariants';
import { attachChild, editNodes } from '../node-edits';
import { rankMagnitude, signedRank } from '../ranks';
import { depthOf, subtreeHeight, subtreeIds } from '../tree';

/** Detached branches: `roots` are pasted as siblings, `nodes` keep their own child lists. */
export interface Fragment {
  roots: string[];
  nodes: Record<string, MindNode>;
}

export function copySubtree(map: MindMap, id: string): Fragment {
  return copyBranches(map, [id]);
}

/** Copy separate branches; `ids` must not contain each other's descendants. */
export function copyBranches(map: MindMap, ids: readonly string[]): Fragment {
  if (!ids.length || ids.some((id) => !Object.hasOwn(map.nodes, id)))
    throw new AppError('edit.nodeNotFound');
  // Nodes are never changed in place, so the fragment can share them with the map.
  const keys = ids.flatMap((id) => subtreeIds(map, id));
  return { roots: [...ids], nodes: Object.fromEntries(keys.map((key) => [key, map.nodes[key]])) };
}

/**
 * Insert copies of `fragment` under `parentId` (after `afterId` when given) with fresh IDs.
 * Returns the new map and the IDs of the pasted top-level nodes.
 */
export function pasteFragment(
  map: MindMap,
  fragment: Fragment,
  parentId: string,
  createId: () => string,
  afterId?: string,
): { map: MindMap; roots: string[] } {
  if (!Object.hasOwn(map.nodes, parentId)) throw new AppError('edit.nodeNotFound');
  assertRoom(map, Object.keys(fragment.nodes).length);
  const depth = depthOf(map, parentId);
  if (fragment.roots.some((root) => depth + subtreeHeight(fragment, root) > MAX_DEPTH))
    throw depthLimit();
  const ids = new Map<string, string>();
  for (const key of Object.keys(fragment.nodes)) {
    let id = createId();
    while (Object.hasOwn(map.nodes, id) || isReservedId(id)) id = createId();
    ids.set(key, id);
  }
  const side = afterId ? map.nodes[afterId].side : map.nodes[parentId].side;
  const edits = editNodes(map);
  for (const [key, node] of Object.entries(fragment.nodes)) {
    const id = ids.get(key)!;
    edits.add({
      ...node,
      id,
      originalId: id,
      parentId: node.parentId !== null && ids.has(node.parentId) ? ids.get(node.parentId)! : null,
      children: node.children.map((child) => ids.get(child)!),
      side,
      rank: signedRank(rankMagnitude(node.rank) || 1, side),
      // Pasted branches start beside their new parent rather than at the copied coordinates.
      position: null,
    });
  }
  let previous = afterId;
  for (const root of fragment.roots) {
    const id = ids.get(root)!;
    attachChild(edits, parentId, id, previous);
    previous = id;
  }
  return { map: edits.done(), roots: fragment.roots.map((root) => ids.get(root)!) };
}

const bullet = /^(?:[-*+•▪◦]|\d+[.)])\s+/;
const indentOf = (line: string) =>
  [...line.match(/^[\t ]*/)![0]].reduce((width, char) => width + (char === '\t' ? 4 : 1), 0);

/** Build branches from an indented or bulleted text outline, one node per non-empty line. */
export function fragmentFromOutline(text: string): Fragment | null {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim());
  if (!lines.length) return null;
  if (lines.length > MAX_NODE_COUNT) throw nodeLimit();
  const fragment: Fragment = { roots: [], nodes: {} };
  const stack: { indent: number; id: string }[] = [];
  lines.forEach((line, index) => {
    const indent = indentOf(line);
    const title = line.trim().replace(bullet, '').trim() || line.trim();
    const id = `line-${index}`;
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    const parentId = stack.at(-1)?.id ?? null;
    // The fragment is still being built here, so its own child lists can grow in place.
    const siblings = parentId ? fragment.nodes[parentId].children : fragment.roots;
    const rank = parentId ? String(siblings.length + 1) : '1';
    fragment.nodes[id] = blankNode(id, title.slice(0, MAX_TITLE), parentId, { rank });
    siblings.push(id);
    stack.push({ indent, id });
  });
  return fragment;
}

/** Plain-text form for other apps: one line per node, a tab per level. */
export function outlineOf(fragment: Fragment): string {
  const lines: string[] = [];
  const visit = (id: string, level: number) => {
    lines.push('\t'.repeat(level) + fragment.nodes[id].title.replace(/\s*\n\s*/g, ' '));
    fragment.nodes[id].children.forEach((child) => visit(child, level + 1));
  };
  fragment.roots.forEach((root) => visit(root, 0));
  return lines.join('\n');
}
