import { describe, expect, it } from 'vitest';
import { addNode, createMap, moveSibling, updateNode } from '../../src/domain/commands';
import {
  copySubtree,
  fragmentFromOutline,
  outlineOf,
  pasteFragment,
} from '../../src/domain/clipboard';
import { setNodePositions } from '../../src/domain/positions';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';

const ids = () => {
  let next = 0;
  return () => `new-${++next}`;
};
let base = addNode(createMap('Root'), 'root', 'a', 'A');
base = addNode(base, 'a', 'a1', 'A1');
base = updateNode(base, 'a1', { notes: 'note', links: ['https://example.com'] });
base = addNode(base, 'root', 'b', 'B');
const valid = (map: typeof base) => parseMaplet(serializeMaplet(map));

describe('branch clipboard', () => {
  it('pastes a copied branch with fresh IDs, content and hierarchy', () => {
    const fragment = copySubtree(base, 'a');
    const { map, roots } = pasteFragment(base, fragment, 'b', ids());
    expect(roots).toEqual(['new-1']);
    const copy = map.nodes['new-1'];
    expect(copy).toMatchObject({ title: 'A', parentId: 'b' });
    expect(map.nodes[copy.children[0]]).toMatchObject({
      title: 'A1',
      notes: 'note',
      links: ['https://example.com'],
    });
    expect(map.nodes.a.children).toEqual(['a1']);
    expect(valid(map).nodes.b.children).toEqual(['new-1']);
  });
  it('duplicates beside the original and drops copied coordinates', () => {
    const placed = setNodePositions(base, { a: { x: 400, y: 50 } });
    const { map, roots } = pasteFragment(placed, copySubtree(placed, 'a'), 'root', ids(), 'a');
    expect(map.nodes.root.children).toEqual(['a', roots[0], 'b']);
    expect(map.nodes[roots[0]].position).toBeNull();
    expect(new Set(map.nodes.root.children.map((id) => map.nodes[id].rank)).size).toBe(3);
    valid(map);
  });
  it('builds branches from indented or bulleted text and writes the same outline back', () => {
    const fragment = fragmentFromOutline('- Plan\n  - Research\n\t- Interviews\n- Ship\r\n\n')!;
    expect(fragment.roots.map((id) => fragment.nodes[id].title)).toEqual(['Plan', 'Ship']);
    expect(outlineOf(fragment)).toBe('Plan\n\tResearch\n\t\tInterviews\nShip');
    const { map, roots } = pasteFragment(base, fragment, 'b', ids());
    expect(map.nodes.b.children).toEqual(roots);
    expect(map.nodes[map.nodes[roots[0]].children[0]].title).toBe('Research');
    valid(map);
    expect(fragmentFromOutline(' \n\t')).toBeNull();
  });
  it('respects node and depth limits', () => {
    const many = fragmentFromOutline(Array.from({ length: 4999 }, (_, i) => `n${i}`).join('\n'))!;
    expect(() => pasteFragment(base, many, 'root', ids())).toThrow('5,000');
    const deep = fragmentFromOutline(
      Array.from({ length: 100 }, (_, i) => ' '.repeat(i) + `d${i}`).join('\n'),
    )!;
    expect(() => pasteFragment(base, deep, 'root', ids())).toThrow('100');
  });
});

describe('sibling order', () => {
  it('swaps with the neighbour on the same side and keeps ranks distinct', () => {
    const moved = moveSibling(base, 'b', -1);
    expect(moved.nodes.root.children).toEqual(['b', 'a']);
    expect(moved.nodes.a.rank).not.toBe(moved.nodes.b.rank);
    expect(valid(moved).nodes.root.children).toEqual(['b', 'a']);
    expect(moveSibling(moved, 'b', -1)).toBe(moved);
    expect(moveSibling(base, 'root', 1)).toBe(base);
  });
  it('releases manual positions of both branches so the new order is visible', () => {
    const placed = setNodePositions(base, { a: { x: 1, y: 2 }, a1: { x: 3, y: 4 } });
    const moved = moveSibling(placed, 'a', 1);
    expect([moved.nodes.a.position, moved.nodes.a1.position]).toEqual([null, null]);
  });
});
