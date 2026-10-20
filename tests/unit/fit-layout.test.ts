import { expect, it } from 'vitest';
import { createMap, addNode } from '../../src/domain/commands';
import { setNodePositions } from '../../src/domain/positions';
import { layoutMap } from '../../src/engine/layout';
import { fitLayout } from '../../src/engine/fit-layout';

it('fits the visible nodes with screen margins without counting export margins twice', () => {
  let map = addNode(createMap('Root'), 'root', 'a', 'Child');
  map = setNodePositions(map, { root: { x: -500, y: -300 }, a: { x: 300, y: 400 } });
  const layout = layoutMap(map),
    viewport = { width: 600, height: 500 };
  const view = fitLayout(layout, viewport);
  const xs = layout.nodes
    .flatMap((node) => [node.x, node.x + node.width])
    .map((x) => x * view.zoom + view.x);
  const ys = layout.nodes
    .flatMap((node) => [node.y, node.y + node.height])
    .map((y) => y * view.zoom + view.y);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(24 - 1e-6);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(24 - 1e-6);
  expect(Math.max(...xs)).toBeLessThanOrEqual(viewport.width - 24 + 1e-6);
  expect(Math.max(...ys)).toBeLessThanOrEqual(viewport.height - 24 + 1e-6);
  expect(Math.min(Math.min(...xs), Math.min(...ys))).toBeCloseTo(24);
});

it('keeps small maps at natural size and respects overview and initial readability limits', () => {
  const map = createMap();
  expect(fitLayout(layoutMap(map), { width: 1000, height: 800 }).zoom).toBe(1);
  const large = layoutMap(
    setNodePositions(addNode(map, 'root', 'a'), {
      root: { x: -100000, y: 0 },
      a: { x: 100000, y: 0 },
    }),
  );
  expect(fitLayout(large, { width: 400, height: 600 }).zoom).toBe(0.15);
  expect(fitLayout(large, { width: 400, height: 600 }, 0.85).zoom).toBe(0.85);
});
