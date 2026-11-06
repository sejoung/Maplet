import type { MindMap } from '../domain/model';
import { measureNode, type TextMeasurer } from './node-measure';

export const NODE_GAP = 24;
export const BRANCH_GAP = 48;
export const LEVEL_GAP = 72;
/** The height of boxes `spans` tall stacked with `gap` between neighbours. */
export const stackSpan = (spans: readonly number[], gap: number) =>
  spans.reduce((sum, span) => sum + span + gap, -gap);

/** How tall each node is and how tall its visible branch stacks (`span`). */
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
    const span = Math.max(
      size.height,
      stackSpan(
        children.map((child) => sizes.get(child)!.span),
        NODE_GAP,
      ),
    );
    sizes.set(id, { ...size, span });
    return span;
  };
  map.roots.forEach(visit);
  return sizes;
}
