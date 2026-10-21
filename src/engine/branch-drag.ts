import type { MindMap, NodePosition, Side } from '../domain/model';
import { canMoveNode } from '../domain/commands';
import { isNodePosition, positionsForSubtreeMove } from '../domain/positions';
import { layoutWithPositions, type Layout, type LayoutNode } from './layout';
import { branchBounds } from './branch-regions';
import { proposeSubtreeMove, type PlacementProposal } from './subtree-placement';

export interface DropTarget {
  id: string;
  side: Side;
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

/** Valid parents for the dragged branches within `reach` of `probe`, nearest first. */
function candidates(
  map: MindMap,
  layout: Layout,
  dragged: readonly string[],
  probe: Probe,
  reach: number,
) {
  return layout.nodes
    .map((node, order) => ({ node, order, gap: gap(node, probe), center: centerGap(node, probe) }))
    .filter((entry) => entry.gap <= reach && adopts(map, dragged, entry.node.id))
    .sort((a, b) => a.gap - b.gap || a.center - b.center || b.order - a.order)
    .map((entry) => entry.node);
}

/**
 * The node that would adopt every dragged branch if dropped now: the nearest valid node within
 * the magnet distance of `probe` (the dragged node's box, or a point), or the `current` target
 * while it stays within the release distance. Pass the layout as it is shown so the target is
 * where the user sees it. Dropping on a root picks the side the probe's center is on.
 */
export function dropTargetAt(
  map: MindMap,
  layout: Layout,
  dragged: readonly string[],
  probe: Probe,
  { zoom = 1, current = null }: { zoom?: number; current?: DropTarget | null } = {},
): DropTarget | null {
  let hit = current ? layout.nodes.find((node) => node.id === current.id) : undefined;
  if (!hit || gap(hit, probe) > DROP_RELEASE / zoom || !adopts(map, dragged, hit.id))
    hit = candidates(map, layout, dragged, probe, DROP_MAGNET / zoom)[0];
  if (!hit) return null;
  const target = map.nodes[hit.id];
  const center = probe.x + (probe.width ?? 0) / 2;
  const side =
    target.parentId === null ? (center < hit.x + hit.width / 2 ? 'left' : 'right') : target.side;
  return { id: hit.id, side };
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
