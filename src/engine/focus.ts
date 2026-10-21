import type { MindMap } from '../domain/model';
import type { Layout } from './layout';

/**
 * Only the branch under `rootId`, at its usual coordinates, so drags and edits made while
 * focused line up with the whole map.
 */
export function focusLayout(map: MindMap, layout: Layout, rootId: string): Layout {
  const ids = new Set<string>();
  const visit = (id: string) => {
    ids.add(id);
    map.nodes[id].children.forEach(visit);
  };
  visit(rootId);
  const nodes = layout.nodes.filter((node) => ids.has(node.id));
  if (!nodes.length) return layout;
  const minX = Math.min(0, ...nodes.map((node) => node.x - 80));
  const minY = Math.min(0, ...nodes.map((node) => node.y - 80));
  return {
    nodes,
    edges: layout.edges.filter((edge) => edge.to !== rootId && ids.has(edge.to)),
    minX,
    minY,
    width: Math.max(...nodes.map((node) => node.x + node.width)) + 80 - minX,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + 80 - minY,
  };
}
