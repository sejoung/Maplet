import type { MindMap, MindNode, Side } from '../domain/model';
import type { TextMeasurer } from './node-measure';
import { BRANCH_GAP, measureTree } from './tree-measure';

/** Balance whole subtrees by their visible height, retaining order on each side. */
export function autoArrange(map: MindMap, measureText?: TextMeasurer): MindMap {
  const sizes = measureTree(map, measureText, true);
  let nodes = map.nodes;
  const patch = (id: string, values: Partial<Pick<MindNode, 'side' | 'rank'>>) => {
    const node = nodes[id];
    if (
      node.position === null &&
      Object.entries(values).every(([key, value]) => node[key as keyof MindNode] === value)
    )
      return;
    if (nodes === map.nodes) nodes = { ...nodes };
    nodes[id] = { ...node, ...values, position: null };
  };
  const branch = (id: string, side: Side, rank?: string) => {
    patch(id, { side, ...(rank !== undefined && { rank }) });
    map.nodes[id].children.forEach((child) => branch(child, side));
  };
  for (const rootId of map.roots) {
    patch(rootId, {});
    const children = map.nodes[rootId].children;
    const heights = { left: 0, right: 0 };
    const sides = new Map<string, Side>();
    // Stable largest-first packing prevents one large branch and several small
    // branches from being treated as equally expensive. Never reorder siblings.
    const ordered = children
      .map((id, index) => ({ id, index, span: sizes.get(id)!.span }))
      .sort((a, b) => b.span - a.span || a.index - b.index);
    for (const { id, span } of ordered) {
      const side = heights.right <= heights.left ? 'right' : 'left';
      sides.set(id, side);
      heights[side] += span + BRANCH_GAP;
    }
    children.forEach((id, index) => {
      const side = sides.get(id)!;
      // Distinct absolute ranks retain the global sibling order in MUP too.
      branch(id, side, String((index + 1) * (side === 'left' ? -1 : 1)));
    });
  }
  return nodes === map.nodes ? map : { ...map, nodes };
}
