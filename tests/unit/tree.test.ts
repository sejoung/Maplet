import { describe, expect, it } from 'vitest';
import {
  ancestors,
  depthOf,
  isDescendant,
  lineage,
  subtreeHeight,
  subtreeIds,
  topBranch,
  type Tree,
} from '../../src/domain/tree';
import { fragmentFromOutline } from '../../src/domain/clipboard';
import { isOneOf } from '../../src/domain/guards';
import { blankNode } from '../../src/domain/model';

const node = (parentId: string | null, children: string[] = []) => ({ parentId, children });
// root ─ a ─ a1 ─ a2
//      └ b
const tree: Tree = {
  nodes: {
    root: node(null, ['a', 'b']),
    a: node('root', ['a1']),
    a1: node('a', ['a2']),
    a2: node('a1'),
    b: node('root'),
  },
};

describe('tree walks', () => {
  it('lists ancestors nearest first and measures depth from the root', () => {
    expect(ancestors(tree, 'a2')).toEqual(['a1', 'a', 'root']);
    expect(ancestors(tree, 'root')).toEqual([]);
    expect(depthOf(tree, 'root')).toBe(1);
    expect(depthOf(tree, 'a2')).toBe(4);
  });

  it('answers descendant questions without throwing for missing nodes', () => {
    expect(isDescendant(tree, 'a', 'a2')).toBe(true);
    expect(isDescendant(tree, 'a2', 'a')).toBe(false);
    expect(isDescendant(tree, 'a', 'a')).toBe(false);
    expect(isDescendant(tree, 'a', 'missing')).toBe(false);
    expect(ancestors(tree, 'missing')).toEqual([]);
  });

  it('stops a lineage at a missing node and lets callers stop at cycles', () => {
    const broken: Tree = { nodes: { x: node('gone'), p: node('q'), q: node('p') } };
    expect([...lineage(broken, 'x')]).toEqual(['x', 'gone']);
    expect([...lineage(broken, null)]).toEqual([]);
    const walk = lineage(broken, 'p');
    expect([walk.next().value, walk.next().value, walk.next().value]).toEqual(['p', 'q', 'p']);
  });

  it('finds the top-level branch, which is the root itself for a root', () => {
    expect(topBranch(tree, 'a2')).toBe('a');
    expect(topBranch(tree, 'b')).toBe('b');
    expect(topBranch(tree, 'root')).toBe('root');
  });

  it('lists a subtree parents first, skipping excluded branches', () => {
    expect(subtreeIds(tree, 'root')).toEqual(['root', 'a', 'a1', 'a2', 'b']);
    expect(subtreeIds(tree, 'root', new Set(['a1']))).toEqual(['root', 'a', 'b']);
    expect(subtreeIds(tree, 'root', new Set(['root']))).toEqual([]);
  });

  it('measures subtree height in levels for maps and clipboard fragments alike', () => {
    expect(subtreeHeight(tree, 'root')).toBe(4);
    expect(subtreeHeight(tree, 'b')).toBe(1);
    const fragment = fragmentFromOutline('A\n  B\n    C\nD')!;
    expect(fragment.roots.map((root) => subtreeHeight(fragment, root))).toEqual([3, 1]);
  });
});

describe('small model helpers', () => {
  it('narrows stored values to a known list', () => {
    const sizes = [12, 15] as const;
    expect(isOneOf(sizes, 12)).toBe(true);
    expect(isOneOf(sizes, '12')).toBe(false);
    expect(isOneOf(sizes, undefined)).toBe(false);
  });

  it('creates blank nodes with overridable placement', () => {
    expect(blankNode('n', 'Title', 'p')).toEqual({
      id: 'n',
      originalId: 'n',
      title: 'Title',
      children: [],
      parentId: 'p',
      rank: '1',
      side: 'right',
      collapsed: false,
      style: {},
      notes: '',
      links: [],
      position: null,
      rawExtensions: {},
    });
    expect(blankNode('n', 'T', null, { side: 'left', rank: '-2' })).toMatchObject({
      side: 'left',
      rank: '-2',
    });
    expect(blankNode('a', 'A', null).children).not.toBe(blankNode('b', 'B', null).children);
  });
});
