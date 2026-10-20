import type { MindMap, NodePosition, Side } from '../domain/model';
import { measureNode, type TextMeasurer } from './node-measure';
import { positionsForSubtreeMove } from '../domain/positions';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  branch: number;
  side: Side;
}
export interface LayoutEdge {
  from: string;
  to: string;
  path: string;
  branch: number;
}
export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  minX: number;
  minY: number;
}

export function layoutMap(map: MindMap, measureText?: TextMeasurer): Layout {
  const nodes: LayoutNode[] = [];
  const sizes = new Map<string, { width: number; height: number; lines: string[]; span: number }>();
  const measure = (id: string): number => {
    const node = map.nodes[id];
    const { width, height, lines } = measureNode(node, measureText);
    const children = node.collapsed ? [] : node.children;
    const childrenSpan = children.reduce((span, child) => span + measure(child) + 24, -24);
    const span = Math.max(height, childrenSpan);
    sizes.set(id, { width, height, lines, span });
    return span;
  };
  map.roots.forEach(measure);
  let rootTop = 80;
  let branch = 0;
  const place = (id: string, x: number, cy: number, side: Side, branchId: number) => {
    const size = sizes.get(id)!;
    nodes.push({
      id,
      x,
      y: cy - size.height / 2,
      width: size.width,
      height: size.height,
      lines: size.lines,
      branch: branchId,
      side,
    });
    const node = map.nodes[id];
    if (node.collapsed) return;
    const children = node.children;
    let top = cy - children.reduce((sum, child) => sum + sizes.get(child)!.span + 24, -24) / 2;
    for (const child of children) {
      const childSize = sizes.get(child)!;
      place(
        child,
        side === 'right' ? x + size.width + 72 : x - childSize.width - 72,
        top + childSize.span / 2,
        side,
        branchId,
      );
      top += childSize.span + 24;
    }
  };
  for (const rootId of map.roots) {
    const root = map.nodes[rootId];
    const rootSize = sizes.get(rootId)!;
    const children = root.collapsed ? [] : root.children;
    const groups = {
      left: children.filter((id) => map.nodes[id].side === 'left'),
      right: children.filter((id) => map.nodes[id].side === 'right'),
    };
    const span = Math.max(
      rootSize.height,
      ...Object.values(groups).map((ids) =>
        ids.reduce((sum, id) => sum + sizes.get(id)!.span + 24, -24),
      ),
    );
    const cy = rootTop + span / 2;
    nodes.push({
      id: rootId,
      x: 0,
      y: cy - rootSize.height / 2,
      width: rootSize.width,
      height: rootSize.height,
      lines: rootSize.lines,
      branch: -1,
      side: 'right',
    });
    for (const side of ['left', 'right'] as const) {
      let top = cy - groups[side].reduce((sum, id) => sum + sizes.get(id)!.span + 24, -24) / 2;
      for (const child of groups[side]) {
        const size = sizes.get(child)!;
        place(
          child,
          side === 'right' ? rootSize.width + 72 : -size.width - 72,
          top + size.span / 2,
          side,
          branch++,
        );
        top += size.span + 24;
      }
    }
    rootTop += span + 120;
  }
  const minX = Math.min(...nodes.map((n) => n.x)) - 80;
  const minY = Math.min(...nodes.map((n) => n.y)) - 80;
  nodes.forEach((node) => {
    node.x -= minX;
    node.y -= minY;
  });
  const manual = Object.values(map.nodes).some((node) => node.position !== null);
  const occupied: LayoutNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const point = map.nodes[node.id].position;
    if (point) {
      node.x = point.x;
      node.y = point.y;
      occupied.push(node);
    }
  }
  for (const node of nodes) {
    if (map.nodes[node.id].position) continue;
    const parentId = map.nodes[node.id].parentId;
    if (manual && parentId !== null) {
      const parent = byId.get(parentId)!;
      node.x = node.side === 'right' ? parent.x + parent.width + 72 : parent.x - node.width - 72;
      node.y = parent.y + (parent.height - node.height) / 2;
      let collision: LayoutNode | undefined;
      while (
        (collision = occupied.find(
          (other) =>
            node.x < other.x + other.width + 24 &&
            node.x + node.width + 24 > other.x &&
            node.y < other.y + other.height + 24 &&
            node.y + node.height + 24 > other.y,
        ))
      )
        node.y = collision.y + collision.height + 24;
    }
    occupied.push(node);
  }
  return finishLayout(
    nodes,
    nodes
      .filter((node) => map.nodes[node.id].parentId !== null)
      .map((node) => ({ from: map.nodes[node.id].parentId!, to: node.id, branch: node.branch })),
  );
}

function finishLayout(nodes: LayoutNode[], relations: Omit<LayoutEdge, 'path'>[]): Layout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = relations.map((edge) => {
    const parent = byId.get(edge.from)!;
    const child = byId.get(edge.to)!;
    const dx = child.x + child.width / 2 - parent.x - parent.width / 2;
    const dy = child.y + child.height / 2 - parent.y - parent.height / 2;
    const horizontal =
      Math.abs(dx) / ((parent.width + child.width) / 2) >=
      Math.abs(dy) / ((parent.height + child.height) / 2);
    child.side = dx < 0 ? 'left' : 'right';
    let path: string;
    if (horizontal) {
      const fromX = dx < 0 ? parent.x : parent.x + parent.width;
      const toX = dx < 0 ? child.x + child.width : child.x;
      const fromY = parent.y + parent.height / 2;
      const toY = child.y + child.height / 2;
      const bend = Math.max(24, Math.abs(toX - fromX) / 2) * (dx < 0 ? -1 : 1);
      path = `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`;
    } else {
      const fromX = parent.x + parent.width / 2;
      const toX = child.x + child.width / 2;
      const fromY = dy < 0 ? parent.y : parent.y + parent.height;
      const toY = dy < 0 ? child.y + child.height : child.y;
      const bend = Math.max(24, Math.abs(toY - fromY) / 2) * (dy < 0 ? -1 : 1);
      path = `M ${fromX} ${fromY} C ${fromX} ${fromY + bend}, ${toX} ${toY - bend}, ${toX} ${toY}`;
    }
    return { ...edge, path };
  });
  const minX = Math.min(0, ...nodes.map((node) => node.x - 80));
  const minY = Math.min(0, ...nodes.map((node) => node.y - 80));
  return {
    nodes,
    edges,
    minX,
    minY,
    width: Math.max(...nodes.map((node) => node.x + node.width)) + 80 - minX,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + 80 - minY,
  };
}

export function moveLayoutSubtree(
  map: MindMap,
  layout: Layout,
  id: string,
  position: NodePosition,
): Layout {
  const positions = positionsForSubtreeMove(
    map,
    Object.fromEntries(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    id,
    position,
  );
  return layoutWithPositions(layout, positions);
}

export function layoutWithPositions(
  layout: Layout,
  positions: Record<string, NodePosition>,
): Layout {
  return finishLayout(
    layout.nodes.map((node) => ({ ...node, ...positions[node.id] })),
    layout.edges.map(({ from, to, branch }) => ({ from, to, branch })),
  );
}
