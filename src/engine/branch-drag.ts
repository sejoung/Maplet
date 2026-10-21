import type { MindMap, NodePosition, Side } from '../domain/model';
import { canMoveNode } from '../domain/commands';
import { isNodePosition, positionsForSubtreeMove } from '../domain/positions';
import { layoutWithPositions, type Layout, type LayoutNode } from './layout';
import { branchBounds } from './branch-regions';
import { proposeSubtreeMove, type PlacementProposal } from './subtree-placement';

/**
 * Where a drop would put the dragged branches: under `id`, beside the hovered `node` (`before`
 * or `after` it among its siblings) or as its last child.
 */
export interface DropTarget {
  id: string;
  side: Side;
  node: string;
  place: 'child' | 'before' | 'after';
}

/** Screen distances between the dragged node and a candidate parent: a node is captured within
 * MAGNET and kept until the gap exceeds RELEASE. */
export const DROP_MAGNET = 16;
export const DROP_RELEASE = 32;

/** A box in map coordinates; a point has no size. */
export type Probe = NodePosition & { width?: number; height?: number };

const gap = (node: LayoutNode, probe: Probe) =>
  Math.hypot(
    Math.max(node.x - probe.x - (probe.width ?? 0), 0, probe.x - node.x - node.width),
    Math.max(node.y - probe.y - (probe.height ?? 0), 0, probe.y - node.y - node.height),
  );
const centerGap = (node: LayoutNode, probe: Probe) =>
  Math.hypot(
    node.x + node.width / 2 - probe.x - (probe.width ?? 0) / 2,
    node.y + node.height / 2 - probe.y - (probe.height ?? 0) / 2,
  );

/** Whether `id` can become the parent of every dragged branch, changing at least one. */
function adopts(map: MindMap, dragged: readonly string[], id: string) {
  return (
    !dragged.every((key) => map.nodes[key].parentId === id) &&
    dragged.every((key) => map.nodes[key].parentId === id || canMoveNode(map, key, id))
  );
}

/** Whether every dragged branch can sit beside `id`, possibly reordering under the same parent. */
function joins(map: MindMap, dragged: readonly string[], id: string) {
  const parent = map.nodes[id].parentId;
  return (
    parent !== null &&
    !dragged.includes(id) &&
    dragged.every((key) => map.nodes[key].parentId === parent || canMoveNode(map, key, parent))
  );
}

/**
 * The drop a probe implies for one node: above or below it, overlapping it horizontally,
 * inserts beside it; anywhere else around it makes it the parent.
 */
function relate(
  map: MindMap,
  dragged: readonly string[],
  node: LayoutNode,
  probe: Probe,
): DropTarget | null {
  const width = probe.width ?? 0,
    height = probe.height ?? 0;
  const center = { x: probe.x + width / 2, y: probe.y + height / 2 };
  const overlapsX =
    Math.min(probe.x + width, node.x + node.width) - Math.max(probe.x, node.x) > 0 ||
    (center.x >= node.x && center.x <= node.x + node.width);
  const target = map.nodes[node.id];
  if (
    overlapsX &&
    (center.y < node.y || center.y > node.y + node.height) &&
    joins(map, dragged, node.id)
  )
    return {
      id: target.parentId!,
      side: target.side,
      node: node.id,
      place: center.y < node.y ? 'before' : 'after',
    };
  if (!adopts(map, dragged, node.id)) return null;
  const side =
    target.parentId === null
      ? center.x < node.x + node.width / 2
        ? 'left'
        : 'right'
      : target.side;
  return { id: node.id, side, node: node.id, place: 'child' };
}

/**
 * The drop that would happen now: relative to the nearest node within the magnet distance of
 * `probe` (the dragged node's box, or a point), or to the `current` target's node while it
 * stays within the release distance. Overlapping several nodes prefers the closest center.
 */
export function dropTargetAt(
  map: MindMap,
  layout: Layout,
  dragged: readonly string[],
  probe: Probe,
  { zoom = 1, current = null }: { zoom?: number; current?: DropTarget | null } = {},
): DropTarget | null {
  const held = current && layout.nodes.find((node) => node.id === current.node);
  if (held && gap(held, probe) <= DROP_RELEASE / zoom) {
    const kept = relate(map, dragged, held, probe);
    if (kept) return kept;
  }
  const near = layout.nodes
    .map((node, order) => ({ node, order, gap: gap(node, probe), center: centerGap(node, probe) }))
    .filter((entry) => entry.gap <= DROP_MAGNET / zoom)
    .sort((a, b) => a.gap - b.gap || a.center - b.center || b.order - a.order);
  for (const { node } of near) {
    const target = relate(map, dragged, node, probe);
    if (target) return target;
  }
  return null;
}

/**
 * Translate several branches together without displacing others, for group drags and drop
 * previews. Returns null when a coordinate would leave the supported range.
 */
export function translateBranches(
  map: MindMap,
  layout: Layout,
  ids: readonly string[],
  delta: NodePosition,
): PlacementProposal | null {
  let positions: Record<string, NodePosition> = Object.fromEntries(
    Object.values(map.nodes).flatMap((node) => (node.position ? [[node.id, node.position]] : [])),
  );
  for (const node of layout.nodes) positions[node.id] = { x: node.x, y: node.y };
  const regions: PlacementProposal['regions'] = [];
  for (const id of ids) {
    const start = positions[id];
    positions = positionsForSubtreeMove(map, positions, id, {
      x: start.x + delta.x,
      y: start.y + delta.y,
    });
    const branch = new Set<string>();
    const visit = (key: string) => {
      branch.add(key);
      map.nodes[key].children.forEach(visit);
    };
    visit(id);
    if ([...branch].some((key) => positions[key] && !isNodePosition(positions[key]))) return null;
    const boxes = layout.nodes
      .filter((node) => branch.has(node.id))
      .map((node) => ({ ...node, ...positions[node.id] }));
    regions.push({
      id,
      nodeIds: boxes.map((node) => node.id),
      kind: 'dragged',
      ...branchBounds(boxes),
    });
  }
  return { positions, displacedIds: [], regions };
}

/** Visible nodes that intersect a rectangle in map coordinates, in layout order. */
export function nodesInRect(
  layout: Layout,
  rect: { x: number; y: number; width: number; height: number },
): string[] {
  return layout.nodes
    .filter(
      (node) =>
        node.x < rect.x + rect.width &&
        node.x + node.width > rect.x &&
        node.y < rect.y + rect.height &&
        node.y + node.height > rect.y,
    )
    .map((node) => node.id);
}

export interface DragState {
  /** Top-level dragged branches; the first one is under the pointer when there is only one. */
  ids: readonly string[];
  /** The node under the pointer; its box decides drop targets. */
  head: string;
  /** Start position of the first dragged node. */
  origin: NodePosition;
  delta: NodePosition;
  zoom: number;
  /**
   * Alt/Option: place freely, pushing other branches aside live, without reparenting.
   * Otherwise the rest of the map holds still so a drop target never moves away.
   */
  free: boolean;
  target: DropTarget | null;
}
export interface DragFrame {
  /** What to draw now. */
  layout: Layout;
  /** What a release without a target commits; its regions are drawn as guides. */
  proposal: PlacementProposal;
  target: DropTarget | null;
}

/**
 * One preview frame of a branch drag, always resolved from the drag's starting layout so the
 * same proposal is committed on release. Returns null when no valid preview exists here.
 */
export function dragFrame(map: MindMap, start: Layout, state: DragState): DragFrame | null {
  const { ids, delta } = state;
  const settle = () =>
    ids.length === 1
      ? proposeSubtreeMove(map, start, ids[0], {
          x: state.origin.x + delta.x,
          y: state.origin.y + delta.y,
        })
      : translateBranches(map, start, ids, delta);
  if (state.free) {
    const proposal = settle();
    if (!proposal) return null;
    return { layout: layoutWithPositions(start, proposal.positions), proposal, target: null };
  }
  const moved = translateBranches(map, start, ids, delta);
  if (!moved) return null;
  const placed = start.nodes.find((node) => node.id === state.head)!;
  const head = { ...placed, x: placed.x + delta.x, y: placed.y + delta.y };
  const target = dropTargetAt(map, start, ids, head, { zoom: state.zoom, current: state.target });
  if (target) {
    // Connectors already lead from the new parent while hovering it.
    const edges = start.edges.map((edge) =>
      ids.includes(edge.to) ? { ...edge, from: target.id } : edge,
    );
    return {
      layout: layoutWithPositions({ ...start, edges }, moved.positions),
      proposal: moved,
      target,
    };
  }
  // Branches that would make room keep their place until release; their guides show where.
  const proposal = settle();
  if (!proposal) return null;
  return { layout: layoutWithPositions(start, moved.positions), proposal, target: null };
}
