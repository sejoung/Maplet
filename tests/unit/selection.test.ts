import { describe, expect, it } from 'vitest';
import {
  addNode,
  canMoveNode,
  createMap,
  deleteNodes,
  updateNode,
} from '../../src/domain/commands';
import { copyBranches, outlineOf } from '../../src/domain/clipboard';
import { MAX_DEPTH } from '../../src/domain/model';
import {
  canDeleteNodes,
  moveNodes,
  topLevel,
  updateNodes,
  visibleSelection,
} from '../../src/domain/selection';
import { setNodePositions } from '../../src/domain/positions';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';

let base = addNode(createMap('Root'), 'root', 'a', 'A');
base = addNode(base, 'a', 'a1', 'A1');
base = addNode(base, 'a1', 'a2', 'A2');
base = addNode(base, 'root', 'b', 'B');
base = addNode(base, 'root', 'c', 'C');
const valid = (map: typeof base) => parseMaplet(serializeMaplet(map));

describe('multi-node selection', () => {
  it('keeps only outermost selected branches in document order', () => {
    expect(topLevel(base, ['c', 'a2', 'a', 'missing', 'b'])).toEqual(['a', 'b', 'c']);
    expect(topLevel(base, ['a1', 'a2'])).toEqual(['a1']);
    expect(topLevel(base, [])).toEqual([]);
  });

  it('drops deleted and collapsed-away nodes from a selection', () => {
    const collapsed = updateNode(base, 'a', { collapsed: true });
    expect(visibleSelection(collapsed, ['a', 'a1', 'gone', 'b'])).toEqual(['a', 'b']);
  });

  it('deletes several branches in one change but never every root', () => {
    const map = deleteNodes(base, topLevel(base, ['a1', 'b', 'a2']));
    expect(Object.keys(map.nodes).sort()).toEqual(['a', 'c', 'root']);
    expect(map.nodes.a.children).toEqual([]);
    expect(valid(map).nodes.root.children).toEqual(['a', 'c']);
    expect(canDeleteNodes(base, ['a', 'b'])).toBe(true);
    expect(canDeleteNodes(base, ['root', 'a'])).toBe(false);
    expect(() => deleteNodes(base, ['root'])).toThrow('edit.cannotDeleteLastCentralNode');
    expect(() => deleteNodes(base, ['missing'])).toThrow('edit.nodeNotFound');
  });

  it('reparents selected branches together and picks the side under a root', () => {
    const map = moveNodes(base, ['c', 'b', 'a2'], 'a1');
    expect(map.nodes.a1.children).toEqual(['a2', 'b', 'c']);
    expect(map.nodes.root.children).toEqual(['a']);
    const left = moveNodes(base, ['a1'], 'root', 'left');
    expect(left.nodes.a1).toMatchObject({ parentId: 'root', side: 'left' });
    expect(left.nodes.a2.side).toBe('left');
    expect(left.nodes.a1.rank.startsWith('-')).toBe(true);
    expect(valid(left).nodes.a1.side).toBe('left');
    // Below a non-root parent, the parent's side always wins.
    expect(moveNodes(base, ['b'], 'a', 'left').nodes.b.side).toBe('right');
  });

  it('reports which drops are allowed without changing the map', () => {
    expect(canMoveNode(base, 'b', 'a2')).toBe(true);
    expect(canMoveNode(base, 'a', 'a2')).toBe(false);
    expect(canMoveNode(base, 'a', 'a')).toBe(false);
    expect(canMoveNode(base, 'a1', 'a')).toBe(false);
    expect(canMoveNode(base, 'root', 'b')).toBe(false);
    expect(canMoveNode(base, 'missing', 'b')).toBe(false);
    // a2 is at depth 4, so d{n} is at depth n + 2.
    let deep = base;
    for (let level = 3; level <= MAX_DEPTH - 2; level++)
      deep = addNode(deep, level === 3 ? 'a2' : `d${level - 1}`, `d${level}`, 'D');
    expect(canMoveNode(deep, 'b', `d${MAX_DEPTH - 2}`)).toBe(false);
    expect(canMoveNode(deep, 'b', `d${MAX_DEPTH - 3}`)).toBe(true);
  });

  it('applies only the changed style properties to every selected node', () => {
    let map = updateNode(base, 'a', { style: { fontSize: 'large', background: '#e8eef8' } });
    map = updateNode(map, 'b', { style: { fontFamily: 'serif' } });
    const styled = updateNodes(map, ['a', 'b', 'root'], 'a', {
      style: { fontSize: 'small', background: '#e8eef8' },
    });
    expect(styled.nodes.a.style).toEqual({ fontSize: 'small', background: '#e8eef8' });
    expect(styled.nodes.b.style).toEqual({ fontFamily: 'serif', fontSize: 'small' });
    expect(styled.nodes.root.style).toEqual({ fontSize: 'small' });
    const cleared = updateNodes(map, ['a', 'b'], 'a', { style: { fontSize: 'large' } });
    expect(cleared.nodes.b.style).toEqual({ fontFamily: 'serif' });
  });

  it('moves every selected non-root to a side and keeps notes on the focused node', () => {
    const sided = updateNodes(base, ['root', 'a', 'b'], 'a', { side: 'left' });
    expect([sided.nodes.a.side, sided.nodes.b.side, sided.nodes.c.side]).toEqual([
      'left',
      'left',
      'right',
    ]);
    const noted = updateNodes(base, ['a', 'b'], 'a', { notes: 'only here' });
    expect([noted.nodes.a.notes, noted.nodes.b.notes]).toEqual(['only here', '']);
    expect(updateNodes(base, ['a'], 'a', { collapsed: false })).toBe(base);
  });

  it('copies several branches as sibling roots of one fragment', () => {
    const placed = setNodePositions(base, { b: { x: 10, y: 20 } });
    const fragment = copyBranches(placed, ['a1', 'b']);
    expect(fragment.roots).toEqual(['a1', 'b']);
    expect(Object.keys(fragment.nodes).sort()).toEqual(['a1', 'a2', 'b']);
    expect(outlineOf(fragment)).toBe('A1\n\tA2\nB');
    expect(() => copyBranches(base, [])).toThrow('edit.nodeNotFound');
  });
});
