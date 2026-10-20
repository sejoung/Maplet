import { expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { setNodePositions } from '../../src/domain/positions';
import { layoutMap, type Layout } from '../../src/engine/layout';
import {
  BRANCH_CLEARANCE,
  proposeSubtreeMove,
  type PlacementProposal,
} from '../../src/engine/subtree-placement';
import { commit, createHistory, undo, redo } from '../../src/application/history';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup } from '../../src/adapters/mup/codec';

function example() {
  let map = addNode(createMap('Root'), 'root', 'a', 'Branch');
  map = addNode(map, 'a', 'child', 'Child');
  map = addNode(map, 'child', 'grandchild', 'Grandchild');
  map = addNode(map, 'root', 'b', 'Other');
  map = addNode(map, 'b', 'bChild', 'Other child');
  for (const id of Object.keys(map.nodes)) map = updateNode(map, id, { style: { width: 100 } });
  return setNodePositions(map, {
    root: { x: -300, y: 100 },
    a: { x: 100, y: 100 },
    child: { x: 280, y: 100 },
    grandchild: { x: 460, y: 100 },
    b: { x: 100, y: 250 },
    bChild: { x: 280, y: 250 },
  });
}
const point = (layout: Layout, id: string) => layout.nodes.find((node) => node.id === id)!;
function expectClear(layout: Layout, group: string[], others: string[]) {
  for (const a of layout.nodes.filter((node) => group.includes(node.id)))
    for (const b of layout.nodes.filter((node) => others.includes(node.id)))
      expect(
        a.x + a.width + BRANCH_CLEARANCE <= b.x + 1e-6 ||
          b.x + b.width + BRANCH_CLEARANCE <= a.x + 1e-6 ||
          a.y + a.height + BRANCH_CLEARANCE <= b.y + 1e-6 ||
          b.y + b.height + BRANCH_CLEARANCE <= a.y + 1e-6,
      ).toBe(true);
}
function expectRegionsClear(proposal: PlacementProposal) {
  for (const a of proposal.regions)
    for (const b of proposal.regions.filter((other) => other.id !== a.id))
      expect(
        a.x + a.width <= b.x + 1e-6 ||
          b.x + b.width <= a.x + 1e-6 ||
          a.y + a.height <= b.y + 1e-6 ||
          b.y + b.height <= a.y + 1e-6,
      ).toBe(true);
}

it('anchors the dragged branch at the exact destination and moves the obstructing branch with its descendants', () => {
  const map = example(),
    before = layoutMap(map);
  const proposal = proposeSubtreeMove(map, before, 'a', { x: 100, y: 250 })!;
  const after = layoutMap(setNodePositions(map, proposal.positions));
  expect(proposal.positions.a).toEqual({ x: 100, y: 250 });
  for (const id of ['a', 'child', 'grandchild']) {
    expect(point(after, id).x).toBe(point(before, id).x);
    expect(point(after, id).y - point(before, id).y).toBe(150);
  }
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expect(point(after, 'b').y).not.toBe(point(before, 'b').y);
  expect(point(after, 'bChild').x - point(after, 'b').x).toBe(180);
  expect(point(after, 'bChild').y - point(after, 'b').y).toBe(0);
  expect(point(after, 'root')).toEqual(point(before, 'root'));
  expectClear(after, ['a', 'child', 'grandchild'], ['root', 'b', 'bChild']);
  expect(map.nodes.a.position).toEqual({ x: 100, y: 100 });
});

it('moves the other branch as a group when only one descendant is obstructed', () => {
  const map = setNodePositions(example(), { b: { x: 460, y: 250 }, bChild: { x: 640, y: 250 } });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  expect(proposal.positions.a).toEqual({ x: 100, y: 250 });
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expect(proposal.positions.bChild.y - proposal.positions.b.y).toBe(0);
  expectClear(
    layoutMap(setNodePositions(map, proposal.positions)),
    ['a', 'child', 'grandchild'],
    ['root', 'b', 'bChild'],
  );
});

it('moves the branch below the common ancestor when dragging a deeper node', () => {
  const map = example();
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'child', { x: 280, y: 250 })!;
  expect(proposal.positions.child).toEqual({ x: 280, y: 250 });
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expect(proposal.positions.a).toEqual(map.nodes.a.position);
});

it('can move an obstructing ancestor without moving the anchored subtree again', () => {
  const map = example();
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: -300, y: 100 })!;
  expect(proposal.positions.a).toEqual({ x: -300, y: 100 });
  expect(proposal.displacedIds).toContain('root');
  const delta = proposal.positions.root.y - map.nodes.root.position!.y;
  expect(proposal.positions.b.y - map.nodes.b.position!.y).toBe(delta);
  expectClear(
    layoutMap(setNodePositions(map, proposal.positions)),
    ['a', 'child', 'grandchild'],
    ['root', 'b', 'bChild'],
  );
});

it('displaces a whole branch that enters the empty space between dragged nodes', () => {
  const map = setNodePositions(updateNode(example(), 'b', { style: { width: 56 } }), {
    b: { x: 210, y: 250 },
    bChild: { x: 640, y: 350 },
  });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  expect(proposal.positions.a).toEqual({ x: 100, y: 250 });
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expect(proposal.positions.b).not.toEqual(map.nodes.b.position);
  expectRegionsClear(proposal);
});

it('protects the empty space inside a stationary branch from an entering child', () => {
  const map = updateNode(
    setNodePositions(example(), {
      b: { x: 100, y: 200 },
      bChild: { x: 600, y: 400 },
    }),
    'a',
    { collapsed: true },
  );
  const target = { x: 350, y: 300 };
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', target)!;
  expect(proposal.positions.a).toEqual(target);
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expectRegionsClear(proposal);
});

it('separates interleaved branch envelopes even when no individual node boxes touch', () => {
  const map = setNodePositions(example(), {
    child: { x: 280, y: 400 },
    b: { x: 100, y: 350 },
    bChild: { x: 640, y: 500 },
  });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  expectRegionsClear(proposal);
  expect(proposal.regions.map(({ id, nodeIds }) => ({ id, nodeIds }))).toEqual([
    { id: 'a', nodeIds: ['a', 'child', 'grandchild'] },
    { id: 'b', nodeIds: ['b', 'bChild'] },
  ]);
});

it('draws just the dragged subtree envelope when other groups are clear', () => {
  const map = example();
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: -500 })!;
  expect(proposal.displacedIds).toEqual([]);
  expect(proposal.positions.b).toEqual(map.nodes.b.position);
  const region = proposal.regions[0];
  expect(proposal.regions).toHaveLength(1);
  expect(region.nodeIds).toEqual(['a', 'child', 'grandchild']);
  expect(region.kind).toBe('dragged');
  expect(region.x).toBe(100 - BRANCH_CLEARANCE / 2);
  expect(region.y).toBe(-500 - BRANCH_CLEARANCE / 2);
  const after = layoutMap(setNodePositions(map, proposal.positions));
  for (const node of after.nodes.filter((node) => region.nodeIds.includes(node.id))) {
    expect(node.x).toBeGreaterThanOrEqual(region.x + BRANCH_CLEARANCE / 2);
    expect(node.y + node.height).toBeLessThanOrEqual(
      region.y + region.height - BRANCH_CLEARANCE / 2,
    );
  }
});

it('includes stored hidden descendants when displacing a collapsed branch', () => {
  const map = updateNode(example(), 'b', { collapsed: true });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  const delta = proposal.positions.b.y - map.nodes.b.position!.y;
  expect(delta).not.toBe(0);
  expect(proposal.positions.bChild.y - map.nodes.bChild.position!.y).toBe(delta);
  expect(proposal.displacedIds).toEqual(['b']);
});

it('also translates hidden descendants of the dragged branch by exactly the requested amount', () => {
  const map = updateNode(example(), 'a', { collapsed: true });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  for (const id of ['a', 'child', 'grandchild'])
    expect(proposal.positions[id]).toEqual({
      x: map.nodes[id].position!.x,
      y: map.nodes[id].position!.y + 150,
    });
});

it('preserves topology and persists both groups as one undo step only when the proposal is applied', () => {
  const map = example(),
    before = layoutMap(map);
  const proposal = proposeSubtreeMove(map, before, 'a', { x: 100, y: 250 })!;
  expect(layoutMap(map)).toEqual(before);
  const moved = setNodePositions(map, proposal.positions);
  expect(moved.nodes.a.parentId).toBe('root');
  expect(moved.nodes.bChild.parentId).toBe('b');
  const history = commit(createHistory(map), moved);
  expect(undo(history).present).toEqual(map);
  expect(redo(undo(history)).present).toEqual(moved);
  expect(layoutMap(parseMaplet(serializeMaplet(moved)))).toEqual(layoutMap(moved));
});

it('anchors a whole root while moving another root and its descendants out of the way', () => {
  let map = parseMup(
    JSON.stringify({
      formatVersion: 3,
      ideas: {
        1: { id: 'one', title: 'one', ideas: { 1: { id: 'child', title: 'child' } } },
        2: { id: 'two', title: 'two', ideas: { 1: { id: 'otherChild', title: 'other child' } } },
      },
    }),
  );
  map = setNodePositions(map, {
    one: { x: 80, y: 80 },
    child: { x: 260, y: 80 },
    two: { x: 80, y: 240 },
    otherChild: { x: 260, y: 240 },
  });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'one', { x: 80, y: 240 })!;
  expect(proposal.positions.one).toEqual({ x: 80, y: 240 });
  expect(proposal.displacedIds).toEqual(['two', 'otherChild']);
  expectClear(
    layoutMap(setNodePositions(map, proposal.positions)),
    ['one', 'child'],
    ['two', 'otherChild'],
  );
});

it('chooses a valid alternative near a hidden coordinate limit', () => {
  const map = updateNode(setNodePositions(example(), { bChild: { x: 280, y: 1_000_000 } }), 'b', {
    collapsed: true,
  });
  const proposal = proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })!;
  expect(proposal.positions.a).toEqual({ x: 100, y: 250 });
  expect(proposal.positions.b.y).toBeLessThan(250);
  expect(() => setNodePositions(map, proposal.positions)).not.toThrow();
});

it('rejects a proposal that cannot keep either group within coordinate limits', () => {
  let map = addNode(example(), 'b', 'limit', 'Limit');
  map = updateNode(
    setNodePositions(map, {
      bChild: { x: -1_000_000, y: -1_000_000 },
      limit: { x: 1_000_000, y: 1_000_000 },
    }),
    'b',
    { collapsed: true },
  );
  expect(proposeSubtreeMove(map, layoutMap(map), 'a', { x: 100, y: 250 })).toBeNull();
  expect(proposeSubtreeMove(map, layoutMap(map), 'a', { x: 1_000_001, y: 250 })).toBeNull();
});

it('handles many obstructing branches deterministically without changing the drop position', () => {
  let map = updateNode(setNodePositions(example(), { a: { x: -1000, y: 250 } }), 'a', {
    collapsed: true,
  });
  for (let i = 0; i < 80; i++) {
    map = addNode(map, 'root', `obstacle${i}`, 'Obstacle');
    map = updateNode(map, `obstacle${i}`, { style: { width: 100 } });
    map = setNodePositions(map, { [`obstacle${i}`]: { x: 200 + i * 100, y: 250 } });
  }
  const layout = layoutMap(map),
    target = { x: 100, y: 250 };
  const proposal = proposeSubtreeMove(map, layout, 'a', target)!;
  expect(proposal).toEqual(proposeSubtreeMove(map, layout, 'a', target));
  expect(proposal.positions.a).toEqual(target);
  expectClear(
    layoutMap(setNodePositions(map, proposal.positions)),
    proposal.displacedIds,
    Object.keys(map.nodes).filter((id) => !proposal.displacedIds.includes(id)),
  );
});
