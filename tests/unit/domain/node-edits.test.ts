import { describe, expect, it } from 'vitest';
import { addNode, createMap } from '../../../src/domain/commands';
import { applyRanks, attachChild, editNodes, placeBranch } from '../../../src/domain/node-edits';
import { blankNode, type MindMap } from '../../../src/domain/model';
import { nextRank, placeRank, renumberRanks } from '../../../src/domain/ranks';

let base = addNode(createMap('Root'), 'root', 'a', 'A');
base = addNode(base, 'a', 'a1', 'A1');
base = addNode(base, 'root', 'b', 'B');
const map: MindMap = Object.freeze({ ...base, nodes: Object.freeze({ ...base.nodes }) });

describe('copy-on-write node edits', () => {
  it('returns the input map when nothing changes', () => {
    const edits = editNodes(map);
    edits.set('a', { title: 'A', collapsed: false });
    expect(edits.nodes).toBe(map.nodes);
    expect(edits.done()).toBe(map);
  });

  it('copies only the nodes it changes and never the input', () => {
    const edits = editNodes(map);
    edits.set('a', { title: 'Changed' });
    edits.set('a', { notes: 'n' });
    const result = edits.done();
    expect(result).not.toBe(map);
    expect(result.nodes.a).toMatchObject({ title: 'Changed', notes: 'n' });
    expect(result.nodes.b).toBe(map.nodes.b);
    expect(map.nodes.a.title).toBe('A');
  });

  it('adds and removes nodes and applies map-level changes', () => {
    const edits = editNodes(map);
    edits.add(blankNode('x', 'X', null));
    edits.remove('b');
    const result = edits.done({ roots: ['root', 'x'] });
    expect(Object.keys(result.nodes)).toEqual(['root', 'a', 'a1', 'x']);
    expect(result.roots).toEqual(['root', 'x']);
    expect(Object.keys(map.nodes)).toContain('b');
  });

  it('attaches a child after a sibling, ranks it between neighbours and expands the parent', () => {
    const collapsed: MindMap = {
      ...map,
      nodes: { ...map.nodes, root: { ...map.nodes.root, collapsed: true } },
    };
    const edits = editNodes(collapsed);
    edits.add(blankNode('n', 'N', null));
    attachChild(edits, 'root', 'n', 'a');
    expect(edits.nodes.root).toMatchObject({ children: ['a', 'n', 'b'], collapsed: false });
    expect(edits.nodes.n).toMatchObject({ parentId: 'root', rank: '1.5' });
    attachChild(edits, 'a', 'b');
    expect(edits.nodes.a.children).toEqual(['a1', 'b']);
  });

  it('moves a branch to a side and releases its manual positions', () => {
    const placed: MindMap = {
      ...map,
      nodes: { ...map.nodes, a1: { ...map.nodes.a1, position: { x: 1, y: 2 } } },
    };
    const edits = editNodes(placed);
    placeBranch(edits, 'a', 'left');
    expect([edits.nodes.a.side, edits.nodes.a1.side, edits.nodes.a1.position]).toEqual([
      'left',
      'left',
      null,
    ]);
    expect(edits.nodes.b).toBe(placed.nodes.b);
  });
});

describe('pure rank helpers', () => {
  const ranked = {
    nodes: {
      a: { rank: '1', side: 'right' as const },
      b: { rank: '2', side: 'right' as const },
      c: { rank: '-1', side: 'left' as const },
      d: { rank: '1', side: 'right' as const },
    },
  };

  it('ranks after the same-side maximum', () => {
    expect(nextRank(ranked, ['a', 'b', 'c'], 'right')).toBe('3');
    expect(nextRank(ranked, ['a', 'b', 'c'], 'left')).toBe('-2');
  });

  it('returns rank changes instead of writing them', () => {
    expect(renumberRanks(ranked, ['b', 'a', 'c'])).toEqual({ b: '1', a: '2', c: '-3' });
    expect(placeRank(ranked, ['a', 'd', 'b'], 'd')).toEqual({ d: '1.5' });
    expect(placeRank(ranked, ['a', 'b', 'd'], 'd')).toEqual({ d: '3' });
    const tight = {
      nodes: { ...ranked.nodes, b: { rank: String(1 + Number.EPSILON), side: 'right' as const } },
    };
    expect(placeRank(tight, ['a', 'd', 'b'], 'd')).toEqual({ a: '1', d: '2', b: '3' });
    expect(ranked.nodes.d.rank).toBe('1');
    const edits = editNodes(map);
    applyRanks(edits, { a: '7' });
    expect(edits.nodes.a.rank).toBe('7');
  });
});
