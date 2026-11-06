import type { JsonObject, MindMap, MindNode } from '../model';
import { AppError } from '../errors';
import { equalJson } from '../util/json';
import { nodeOf, titleOf } from '../invariants';
import { editNodes } from '../node-edits';
import { setBranchSide } from './structure';

/** The node fields the style, notes and links tools change. */
export type NodePatch = Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'collapsed' | 'side'>>;

export function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function renameNode(map: MindMap, id: string, title: string): MindMap {
  const node = nodeOf(map, id);
  titleOf(title);
  if (node.title === title) return map;
  return { ...map, nodes: { ...map.nodes, [id]: { ...node, title } } };
}

/** Change a node's content; a new `side` moves its whole top-level branch (`setBranchSide`). */
export function updateNode(map: MindMap, id: string, patch: NodePatch): MindMap {
  const node = nodeOf(map, id);
  if (patch.links?.some((link) => !safeUrl(link)))
    throw new AppError('common.linksMustUseHttpHttps');
  if (Object.entries(patch).every(([key, value]) => equalJson(node[key as keyof MindNode], value)))
    return map;
  const { side, ...content } = patch;
  const edits = editNodes(side === undefined ? map : setBranchSide(map, id, side));
  edits.set(id, content);
  return edits.done();
}

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
    const style = patch.style && restyle(node.style, from, patch.style);
    return updateNode(current, id, style ? { ...patch, style } : patch);
  }, map);
}

/** `style` with the properties `from` → `to` changed; the result is a fresh object. */
function restyle(style: JsonObject, from: JsonObject, to: JsonObject): JsonObject {
  const result = { ...style };
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (equalJson(from[key], to[key])) continue;
    if (Object.hasOwn(to, key)) result[key] = to[key];
    else delete result[key];
  }
  return result;
}

/**
 * Show the map down to `depth` levels (roots are level 1): deeper nodes with children are
 * collapsed, shallower ones expanded. `null` expands everything; `under` limits the change to
 * one branch, counting its levels from that node.
 */
export function showLevels(map: MindMap, depth: number | null, under?: string): MindMap {
  const edits = editNodes(map);
  const visit = (id: string, level: number) => {
    const node = map.nodes[id];
    if (!node.children.length) return;
    edits.set(id, { collapsed: depth !== null && level >= depth });
    node.children.forEach((child) => visit(child, level + 1));
  };
  if (under !== undefined) visit(nodeOf(map, under).id, 1);
  else map.roots.forEach((id) => visit(id, 1));
  return edits.done();
}
