import { MAX_DEPTH, MAX_NODE_COUNT, MAX_TITLE, type MindMap, type MindNode } from './model';
import { AppError } from './errors';
import { attachChild, depthLimit, depthOf, nodeLimit } from './commands';
import { isReservedId } from './ids';
import { rankMagnitude, signedRank } from './ranks';

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
    throw new AppError('노드를 찾을 수 없습니다.');
  const nodes: Record<string, MindNode> = {};
  const visit = (key: string) => {
    nodes[key] = structuredClone(map.nodes[key]);
    map.nodes[key].children.forEach(visit);
  };
  ids.forEach(visit);
  return { roots: [...ids], nodes };
}

const height = (fragment: Fragment, id: string): number =>
  1 + Math.max(0, ...fragment.nodes[id].children.map((child) => height(fragment, child)));

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
  if (!Object.hasOwn(map.nodes, parentId)) throw new AppError('노드를 찾을 수 없습니다.');
  if (Object.keys(map.nodes).length + Object.keys(fragment.nodes).length > MAX_NODE_COUNT)
    throw nodeLimit();
  const depth = depthOf(map, parentId);
  if (fragment.roots.some((root) => depth + height(fragment, root) > MAX_DEPTH)) throw depthLimit();
  const ids = new Map<string, string>();
  for (const key of Object.keys(fragment.nodes)) {
    let id = createId();
    while (Object.hasOwn(map.nodes, id) || isReservedId(id)) id = createId();
    ids.set(key, id);
  }
  const side = afterId ? map.nodes[afterId].side : map.nodes[parentId].side;
  const result = structuredClone(map);
  for (const [key, node] of Object.entries(fragment.nodes)) {
    const id = ids.get(key)!;
    result.nodes[id] = {
      ...structuredClone(node),
      id,
      originalId: id,
      parentId: node.parentId !== null && ids.has(node.parentId) ? ids.get(node.parentId)! : null,
      children: node.children.map((child) => ids.get(child)!),
      side,
      rank: signedRank(rankMagnitude(node.rank) || 1, side),
      // Pasted branches start beside their new parent rather than at the copied coordinates.
      position: null,
    };
  }
  let previous = afterId;
  for (const root of fragment.roots) {
    const id = ids.get(root)!;
    result.nodes[id].parentId = parentId;
    attachChild(result, result, parentId, id, previous);
    previous = id;
  }
  return { map: result, roots: fragment.roots.map((root) => ids.get(root)!) };
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
    fragment.nodes[id] = {
      id,
      originalId: id,
      title: title.slice(0, MAX_TITLE),
      children: [],
      parentId,
      rank: '1',
      side: 'right',
      collapsed: false,
      style: {},
      notes: '',
      links: [],
      position: null,
      rawExtensions: {},
    };
    if (parentId) {
      fragment.nodes[id].rank = String(fragment.nodes[parentId].children.length + 1);
      fragment.nodes[parentId].children.push(id);
    } else fragment.roots.push(id);
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
