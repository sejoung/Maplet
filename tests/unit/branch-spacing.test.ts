import { expect, it } from 'vitest';
import { parseMup } from '../../src/adapters/mup/codec';
import { setNodePositions } from '../../src/domain/positions';
import { layoutMap } from '../../src/engine/layout';
import { proposeSubtreeMove } from '../../src/engine/subtree-placement';
import { branchSpacingSource } from '../support/drag-fixture';

it.each([
  { name: 'a descendant hits another branch', intrusion: false, initialOverlap: false, dy: 160 },
  {
    name: 'a descendant enters empty group space',
    intrusion: true,
    initialOverlap: false,
    dy: 180,
  },
  {
    name: 'an existing intrusion is corrected at the origin',
    intrusion: true,
    initialOverlap: true,
    dy: 0,
  },
])('keeps complete branch envelopes clear when $name', ({ intrusion, initialOverlap, dy }) => {
  const map = parseMup(branchSpacingSource(intrusion, initialOverlap));
  const before = layoutMap(map);
  const snapshot = structuredClone(map);
  const a = before.nodes.find((node) => node.id === 'a')!;
  const proposal = proposeSubtreeMove(map, before, 'a', { x: a.x, y: a.y + dy })!;
  const after = layoutMap(setNodePositions(map, proposal.positions));
  expect(proposal.positions.a).toEqual({ x: a.x, y: a.y + dy });
  expect(proposal.displacedIds).toEqual(['b', 'bChild']);
  for (const [parent, child] of [
    ['a', 'child'],
    ['b', 'bChild'],
  ]) {
    const original = before.nodes.find((node) => node.id === parent)!;
    const descendant = before.nodes.find((node) => node.id === child)!;
    expect(proposal.positions[child].x - proposal.positions[parent].x).toBe(
      descendant.x - original.x,
    );
    expect(proposal.positions[child].y - proposal.positions[parent].y).toBe(
      descendant.y - original.y,
    );
  }
  expect(proposal.regions).toHaveLength(2);
  for (const region of proposal.regions) {
    const nodes = after.nodes.filter((node) => region.nodeIds.includes(node.id));
    expect(region.x).toBe(Math.min(...nodes.map((node) => node.x)) - 12);
    expect(region.y).toBe(Math.min(...nodes.map((node) => node.y)) - 12);
    expect(region.x + region.width).toBe(
      Math.max(...nodes.map((node) => node.x + node.width)) + 12,
    );
    expect(region.y + region.height).toBe(
      Math.max(...nodes.map((node) => node.y + node.height)) + 12,
    );
  }
  const [dragged, displaced] = proposal.regions;
  expect(dragged.nodeIds).toEqual(['a', 'child']);
  expect(displaced.nodeIds).toEqual(['b', 'bChild']);
  expect(
    dragged.x + dragged.width <= displaced.x ||
      displaced.x + displaced.width <= dragged.x ||
      dragged.y + dragged.height <= displaced.y ||
      displaced.y + displaced.height <= dragged.y,
  ).toBe(true);
  if (intrusion && !initialOverlap)
    for (const node of after.nodes.filter((node) => ['a', 'child'].includes(node.id)))
      for (const other of before.nodes.filter((node) => ['b', 'bChild'].includes(node.id)))
        expect(
          node.x + node.width <= other.x ||
            other.x + other.width <= node.x ||
            node.y + node.height <= other.y ||
            other.y + other.height <= node.y,
        ).toBe(true);
  expect(map).toEqual(snapshot);
});
