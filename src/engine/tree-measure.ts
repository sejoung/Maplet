import type { MindMap } from '../domain/model';
import { measureNode, type TextMeasurer } from './node-measure';

export const NODE_GAP = 24;
export const BRANCH_GAP = 48;
export const LEVEL_GAP = 72;
export interface TreeSize extends ReturnType<typeof measureNode> {
  span: number;
}

export function measureTree(map: MindMap, measureText?: TextMeasurer, includeHidden = false) {
  const sizes = new Map<string, TreeSize>();
  const visit = (id: string): number => {
    const node = map.nodes[id];
    const size = measureNode(node, measureText);
    if (includeHidden || !node.collapsed) node.children.forEach(visit);
    const children = node.collapsed ? [] : node.children;
    const childrenSpan = children.reduce(
      (sum, child) => sum + sizes.get(child)!.span + NODE_GAP,
      -NODE_GAP,
    );
    const span = Math.max(size.height, childrenSpan);
    sizes.set(id, { ...size, span });
    return span;
  };
  map.roots.forEach(visit);
  return sizes;
}
