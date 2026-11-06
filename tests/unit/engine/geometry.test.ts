import { describe, expect, it } from 'vitest';
import { addNode, createMap } from '../../../src/domain/commands';
import { setNodePositions } from '../../../src/domain/commands/positions';
import { boundsOf, intersects, seedPositions } from '../../../src/engine/geometry';
import { LAYOUT_MARGIN, layoutBounds } from '../../../src/engine/layout/layout';
import { stackSpan } from '../../../src/engine/layout/tree-measure';

const box = (x: number, y: number, width = 10, height = 10) => ({ x, y, width, height });

describe('geometry helpers', () => {
  it('bounds boxes with optional padding', () => {
    expect(boundsOf([box(0, 0), box(20, 5, 5, 20)])).toEqual(box(0, 0, 25, 25));
    expect(boundsOf([box(10, 10)], 4)).toEqual(box(6, 6, 18, 18));
  });

  it('treats touching boxes as apart and honours a margin either way', () => {
    expect(intersects(box(0, 0), box(10, 0))).toBe(false);
    expect(intersects(box(0, 0), box(9, 9))).toBe(true);
    expect(intersects(box(0, 0), box(15, 0), 6)).toBe(true);
    expect(intersects(box(0, 0), box(9.5, 0), -1)).toBe(false);
  });

  it('seeds positions from the layout, falling back to saved positions of hidden nodes', () => {
    let map = addNode(createMap('Root'), 'root', 'a', 'A');
    map = setNodePositions(map, { a: { x: 7, y: 8 }, root: { x: 1, y: 1 } });
    const placed = [{ id: 'root', x: 100, y: 200 }];
    expect(seedPositions(map, placed)).toEqual({ root: { x: 100, y: 200 }, a: { x: 7, y: 8 } });
  });

  it('extends the canvas to the origin and the layout margin', () => {
    expect(layoutBounds([box(200, 300, 50, 20)])).toEqual({
      minX: 0,
      minY: 0,
      width: 250 + LAYOUT_MARGIN,
      height: 320 + LAYOUT_MARGIN,
    });
    expect(layoutBounds([box(-100, 0)])).toMatchObject({
      minX: -100 - LAYOUT_MARGIN,
      minY: -LAYOUT_MARGIN,
    });
  });

  it('stacks spans with gaps only between neighbours', () => {
    expect(stackSpan([10, 20, 30], 5)).toBe(70);
    expect(stackSpan([10], 5)).toBe(10);
    expect(stackSpan([], 5)).toBe(-5);
  });
});
