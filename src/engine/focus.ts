import type { MindMap } from '../domain/model';
import { subtreeIds } from '../domain/tree';
import { layoutBounds, type Layout } from './layout';

/**
 * Only the branch under `rootId`, at its usual coordinates, so drags and edits made while
 * focused line up with the whole map.
 */
export function focusLayout(map: MindMap, layout: Layout, rootId: string): Layout {
  const ids = new Set(subtreeIds(map, rootId));
  const nodes = layout.nodes.filter((node) => ids.has(node.id));
  if (!nodes.length) return layout;
  return {
    nodes,
    edges: layout.edges.filter((edge) => edge.to !== rootId && ids.has(edge.to)),
    ...layoutBounds(nodes),
  };
}
