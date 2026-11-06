import type { MindMap, Side } from '../../domain/model';
import { editNodes, placeBranch } from '../../domain/node-edits';
import { signedRank } from '../../domain/ranks';
import type { TextMeasurer } from './node-measure';
import { BRANCH_GAP, measureTree } from './tree-measure';

/** Balance whole subtrees by their visible height, retaining order on each side. */
export function autoArrange(map: MindMap, measureText?: TextMeasurer): MindMap {
  const sizes = measureTree(map, measureText, true);
  const edits = editNodes(map);
  for (const rootId of map.roots) {
    edits.set(rootId, { position: null });
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
      placeBranch(edits, id, side);
      // Distinct absolute ranks retain the global sibling order in MUP too.
      edits.set(id, { rank: signedRank(index + 1, side) });
    });
  }
  return edits.done();
}
