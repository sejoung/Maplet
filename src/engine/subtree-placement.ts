import type { MindMap, NodePosition } from '../domain/model';
import { isNodePosition, positionsForSubtreeMove } from '../domain/positions';
import { ancestors, subtreeIds } from '../domain/tree';
import type { Layout } from './layout';
import { intersects, seedPositions } from './geometry';
import { branchBounds, type BranchBounds, type BranchRegion } from './branch-regions';

export { BRANCH_CLEARANCE } from './branch-regions';
const EPSILON = 1e-7;
type Box = BranchBounds;

// Boxes that only touch within rounding error do not obstruct each other.
const overlaps = (a: Box, b: Box) => intersects(a, b, -EPSILON);

export interface PlacementProposal {
  positions: Record<string, NodePosition>;
  displacedIds: string[];
  regions: BranchRegion[];
}

// The dragged branch owns its destination. Move obstructing branches as rigid
// groups for a live preview; the document changes only when the drag ends.
export function proposeSubtreeMove(
  map: MindMap,
  layout: Layout,
  id: string,
  target: NodePosition,
): PlacementProposal | null {
  const original = seedPositions(map, layout.nodes);
  const positions = positionsForSubtreeMove(map, original, id, target);
  const collect = (root: string, excluded?: ReadonlySet<string>) =>
    new Set(subtreeIds(map, root, excluded));
  const dragged = collect(id);
  if ([...dragged].some((key) => positions[key] && !isNodePosition(positions[key]))) return null;
  const path = new Set(ancestors(map, id));
  // The highest node of `key`'s chain that is not on the dragged node's ancestor path.
  const branchRoot = (key: string) =>
    path.has(key)
      ? key
      : [key, ...ancestors(map, key)].find((node) => {
          const parent = map.nodes[node].parentId;
          return parent === null || path.has(parent);
        })!;
  let boxes = layout.nodes.map((node) => ({ ...node, ...positions[node.id] }));
  const boundsFor = (ids: Set<string>) => branchBounds(boxes.filter((node) => ids.has(node.id)));
  const anchored = boundsFor(dragged);
  // Each pass moves one group; caching the others' bounds keeps a pass linear in node count.
  const cached = new Map<string, BranchBounds>();
  const groupBounds = (group: { id: string; ids: Set<string> }) => {
    let bounds = cached.get(group.id);
    if (!bounds) cached.set(group.id, (bounds = boundsFor(group.ids)));
    return bounds;
  };
  // Partition the remaining tree into sibling subtrees along the dragged
  // node's ancestor path. Ancestors themselves are not enclosing groups.
  const groups = [
    ...new Set(boxes.filter((node) => !dragged.has(node.id)).map((node) => branchRoot(node.id))),
  ].map((root) => ({
    id: root,
    ids: path.has(root) ? new Set([root]) : collect(root),
  }));
  const displaced = new Set<string>();
  let movedGroups: { id: string; ids: Set<string> }[] = [];

  const dx = target.x - original[id].x,
    dy = target.y - original[id].y;
  const horizontal: NodePosition = { x: dx < 0 ? -1 : 1, y: 0 };
  const vertical: NodePosition = { x: 0, y: dy < 0 ? -1 : 1 };
  const preferred = Math.abs(dx) > Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
  const directions = [...preferred, ...preferred.map(({ x, y }) => ({ x: -x, y: -y }))];
  for (let pass = 0; pass < boxes.length; pass++) {
    const obstruction = groups.find((group) => overlaps(groupBounds(group), anchored));
    if (!obstruction)
      return {
        positions,
        displacedIds: boxes.filter((node) => displaced.has(node.id)).map((node) => node.id),
        regions: [{ id, ids: dragged }, ...movedGroups].map((group, index) => ({
          id: group.id,
          nodeIds: boxes.filter((node) => group.ids.has(node.id)).map((node) => node.id),
          kind: index === 0 ? 'dragged' : 'displaced',
          ...boundsFor(group.ids),
        })),
      };
    const group = collect(obstruction.id, dragged);
    const moving = boxes.filter((node) => group.has(node.id));
    const fixed = [anchored, ...groups.filter((other) => !group.has(other.id)).map(groupBounds)];
    const saved = [...group].flatMap((key) => (positions[key] ? [positions[key]] : []));
    let best: NodePosition | null = null;
    let distance = Infinity;
    for (const direction of directions) {
      const offset = separate([branchBounds(moving)], fixed, direction, distance);
      if (
        !offset ||
        saved.some((point) => !isNodePosition({ x: point.x + offset.x, y: point.y + offset.y }))
      )
        continue;
      const length = Math.abs(offset.x) + Math.abs(offset.y);
      if (length < distance - EPSILON) {
        best = offset;
        distance = length;
      }
    }
    if (!best) return null;
    movedGroups = movedGroups.filter((other) => !group.has(other.id));
    movedGroups.push({ id: obstruction.id, ids: group });
    for (const key of group) {
      const point = positions[key];
      if (point) positions[key] = { x: point.x + best.x, y: point.y + best.y };
    }
    const shift = best;
    boxes = boxes.map((node) =>
      group.has(node.id) ? { ...node, x: node.x + shift.x, y: node.y + shift.y } : node,
    );
    moving.forEach((node) => displaced.add(node.id));
    for (const other of groups)
      if ([...other.ids].some((key) => group.has(key))) cached.delete(other.id);
  }
  return null;
}

function separate(
  moving: Box[],
  fixed: Box[],
  direction: NodePosition,
  limit: number,
): NodePosition | null {
  const axis = direction.x ? 'x' : 'y';
  const extent = axis === 'x' ? 'width' : 'height';
  const sign = direction[axis];
  let offset = 0;
  for (let pass = 0; pass < 32; pass++) {
    let next = offset;
    for (const node of moving) {
      const shifted = { ...node, [axis]: node[axis] + offset };
      for (const other of fixed) {
        if (!overlaps(shifted, other)) continue;
        const required =
          sign > 0
            ? other[axis] + other[extent] - node[axis]
            : other[axis] - node[axis] - node[extent];
        next = sign > 0 ? Math.max(next, required) : Math.min(next, required);
      }
    }
    if (Math.abs(next) > limit + EPSILON) return null;
    if (Math.abs(next - offset) < EPSILON) return { x: 0, y: 0, [axis]: offset };
    offset = next;
  }
  // Bound work for dense imported maps. Outside the fixed nodes' bounds is
  // always free, even when successive collisions form a long chain.
  offset =
    sign > 0
      ? Math.max(...fixed.map((node) => node[axis] + node[extent])) -
        Math.min(...moving.map((node) => node[axis]))
      : Math.min(...fixed.map((node) => node[axis])) -
        Math.max(...moving.map((node) => node[axis] + node[extent]));
  return Math.abs(offset) <= limit + EPSILON ? { x: 0, y: 0, [axis]: offset } : null;
}
