import type { MindMap, NodePosition, Side } from '../domain/model';
import type { MeasuredRun, TextMeasurer } from './node-measure';
import { positionsForSubtreeMove } from '../domain/positions';
import { BRANCH_GAP, LEVEL_GAP, NODE_GAP, measureTree, stackSpan } from './tree-measure';
import { boundsOf, intersects, type Box } from './geometry';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  /** The same lines split into formatted runs with their measured widths. */
  runs: MeasuredRun[][];
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

/** Space around the laid-out map, so edge nodes are not flush with the canvas border. */
export const LAYOUT_MARGIN = 80;
/** Vertical space between the trees of separate central topics. */
const ROOT_GAP = 120;
/** Space a pinned layout keeps between automatically placed nodes and others. */
const CLEARANCE = 24;
/** The least curvature of a connector, so short ones still read as curves. */
const MIN_BEND = 24;

type Sizes = ReturnType<typeof measureTree>;
type Relation = Omit<LayoutEdge, 'path'>;

export function layoutMap(map: MindMap, measureText?: TextMeasurer): Layout {
  const nodes = applyManualPositions(map, placeTree(map, measureTree(map, measureText)));
  return finishLayout(
    nodes,
    nodes
      .filter((node) => map.nodes[node.id].parentId !== null)
      .map((node) => ({ from: map.nodes[node.id].parentId!, to: node.id, branch: node.branch })),
  );
}

/** Vertical centers of `ids` stacked around `center`, each taking its span plus `gap`. */
function stackChildren(ids: readonly string[], center: number, gap: number, sizes: Sizes) {
  let top =
    center -
    stackSpan(
      ids.map((id) => sizes.get(id)!.span),
      gap,
    ) /
      2;
  return ids.map((id) => {
    const span = sizes.get(id)!.span;
    const middle = top + span / 2;
    top += span + gap;
    return { id, center: middle };
  });
}

/**
 * The automatic layout: each central topic with its branches fanned out left and right,
 * the topics stacked top to bottom, shifted so the whole map starts at the margin.
 */
function placeTree(map: MindMap, sizes: Sizes): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  const box = (id: string, x: number, center: number, side: Side, branch: number) => {
    const size = sizes.get(id)!;
    const node: LayoutNode = {
      id,
      x,
      y: center - size.height / 2,
      width: size.width,
      height: size.height,
      lines: size.lines,
      runs: size.runs,
      branch,
      side,
    };
    nodes.push(node);
    return node;
  };
  const beside = (parentX: number, parentWidth: number, id: string, side: Side) =>
    side === 'right'
      ? parentX + parentWidth + LEVEL_GAP
      : parentX - sizes.get(id)!.width - LEVEL_GAP;
  const placeBranch = (id: string, x: number, center: number, side: Side, branch: number) => {
    const node = box(id, x, center, side, branch);
    if (map.nodes[id].collapsed) return;
    for (const child of stackChildren(map.nodes[id].children, center, NODE_GAP, sizes))
      placeBranch(child.id, beside(x, node.width, child.id, side), child.center, side, branch);
  };
  let top = LAYOUT_MARGIN;
  let branch = 0;
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
        stackSpan(
          ids.map((id) => sizes.get(id)!.span),
          BRANCH_GAP,
        ),
      ),
    );
    const center = top + span / 2;
    box(rootId, 0, center, 'right', -1);
    for (const side of ['left', 'right'] as const)
      for (const child of stackChildren(groups[side], center, BRANCH_GAP, sizes))
        placeBranch(
          child.id,
          beside(0, rootSize.width, child.id, side),
          child.center,
          side,
          branch++,
        );
    top += span + ROOT_GAP;
  }
  const { x, y } = boundsOf(nodes, LAYOUT_MARGIN);
  return nodes.map((node) => ({ ...node, x: node.x - x, y: node.y - y }));
}

/**
 * Pinned nodes take their saved positions. Once any node is pinned, the others are placed
 * beside their parent and moved down out of the way, so nothing lands on a pinned node.
 */
function applyManualPositions(map: MindMap, placed: LayoutNode[]): LayoutNode[] {
  const pinned = placed.map((node) => {
    const point = map.nodes[node.id].position;
    return point ? { ...node, x: point.x, y: point.y } : node;
  });
  if (!Object.values(map.nodes).some((node) => node.position !== null)) return pinned;
  const occupied = new OccupiedRows();
  pinned.forEach((node) => {
    if (map.nodes[node.id].position) occupied.add(node);
  });
  const final = new Map<string, LayoutNode>();
  return pinned.map((node) => {
    const { position, parentId } = map.nodes[node.id];
    let result = node;
    if (!position) {
      if (parentId !== null) {
        const parent = final.get(parentId)!;
        const x =
          node.side === 'right'
            ? parent.x + parent.width + LEVEL_GAP
            : parent.x - node.width - LEVEL_GAP;
        const beside = { ...node, x, y: parent.y + (parent.height - node.height) / 2 };
        result = { ...beside, y: occupied.freeY(beside) };
      }
      occupied.add(result);
    }
    final.set(node.id, result);
    return result;
  });
}

/** Placed boxes ordered by top edge, so a collision search only visits nearby rows. */
class OccupiedRows {
  private boxes: Box[] = [];
  private tallest = 0;

  add(box: Box) {
    let low = 0,
      high = this.boxes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.boxes[middle].y <= box.y) low = middle + 1;
      else high = middle;
    }
    this.boxes.splice(low, 0, box);
    this.tallest = Math.max(this.tallest, box.height);
  }

  /**
   * The top of the first free slot at or below `box`. It only moves downward, so one sweep
   * in top order reaches the same slot as rescanning every box after each move.
   */
  freeY(box: Box): number {
    let y = box.y;
    const reach = y - this.tallest - CLEARANCE;
    let index = 0,
      high = this.boxes.length;
    while (index < high) {
      const middle = (index + high) >> 1;
      if (this.boxes[middle].y < reach) index = middle + 1;
      else high = middle;
    }
    for (; index < this.boxes.length; index++) {
      const other = this.boxes[index];
      if (other.y >= y + box.height + CLEARANCE) break;
      if (intersects({ ...box, y }, other, CLEARANCE)) y = other.y + other.height + CLEARANCE;
    }
    return y;
  }
}

/**
 * Whether a connector leaves the parent's side rather than its top or bottom. A child beside
 * the parent, however far up or down, keeps the side-to-side curve the automatic layout
 * draws, so pinning or moving nodes does not turn a tidy fan of branches into vertical lines.
 * Only a child overlapping the parent's columns is joined top to bottom.
 */
function joinsSideways(parent: LayoutNode, child: LayoutNode, dx: number, dy: number) {
  const gap = Math.max(child.x - parent.x - parent.width, parent.x - child.x - child.width);
  if (gap >= 0) return true;
  // Overlapping boxes: whichever axis separates their centers more.
  return (
    Math.abs(dx) / ((parent.width + child.width) / 2) >=
    Math.abs(dy) / ((parent.height + child.height) / 2)
  );
}

/** The connector from `parent` to `child`, whose centers are `dx`, `dy` apart. */
function connectorPath(parent: LayoutNode, child: LayoutNode, dx: number, dy: number) {
  if (joinsSideways(parent, child, dx, dy)) {
    const fromX = dx < 0 ? parent.x : parent.x + parent.width;
    const toX = dx < 0 ? child.x + child.width : child.x;
    const fromY = parent.y + parent.height / 2;
    const toY = child.y + child.height / 2;
    const bend = Math.max(MIN_BEND, Math.abs(toX - fromX) / 2) * (dx < 0 ? -1 : 1);
    return `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`;
  }
  const fromX = parent.x + parent.width / 2;
  const toX = child.x + child.width / 2;
  const fromY = dy < 0 ? parent.y : parent.y + parent.height;
  const toY = dy < 0 ? child.y + child.height : child.y;
  const bend = Math.max(MIN_BEND, Math.abs(toY - fromY) / 2) * (dy < 0 ? -1 : 1);
  return `M ${fromX} ${fromY} C ${fromX} ${fromY + bend}, ${toX} ${toY - bend}, ${toX} ${toY}`;
}

/** The canvas extent of `nodes`: their bounds plus the margin, always including the origin. */
export function layoutBounds(nodes: readonly Box[]) {
  const box = boundsOf(nodes, LAYOUT_MARGIN);
  const minX = Math.min(0, box.x);
  const minY = Math.min(0, box.y);
  return {
    minX,
    minY,
    width: Math.max(...nodes.map((node) => node.x + node.width)) + LAYOUT_MARGIN - minX,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + LAYOUT_MARGIN - minY,
  };
}

/** Draw connectors and size the canvas; a child's side follows where it now sits. */
function finishLayout(placed: LayoutNode[], relations: Relation[]): Layout {
  const byId = new Map(placed.map((node) => [node.id, node]));
  const sides = new Map<string, Side>();
  const edges = relations.map((edge) => {
    const parent = byId.get(edge.from)!;
    const child = byId.get(edge.to)!;
    const dx = child.x + child.width / 2 - parent.x - parent.width / 2;
    const dy = child.y + child.height / 2 - parent.y - parent.height / 2;
    sides.set(child.id, dx < 0 ? 'left' : 'right');
    return { ...edge, path: connectorPath(parent, child, dx, dy) };
  });
  const nodes = placed.map((node) => {
    const side = sides.get(node.id) ?? node.side;
    return side === node.side ? node : { ...node, side };
  });
  return { nodes, edges, ...layoutBounds(nodes) };
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
