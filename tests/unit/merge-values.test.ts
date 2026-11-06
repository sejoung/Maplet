import { describe, expect, it } from 'vitest';
import { conflictId, mergeValue, type MergeResolution } from '../../src/domain/merge-values';
import { rebuildTree } from '../../src/domain/merge-tree';
import { addNode, createMap } from '../../src/domain/commands';
import { nodeMarkers } from '../../src/domain/node-markers';

const resolution = (choices = {}): MergeResolution => ({ conflicts: [], choices });

describe('value merge helpers', () => {
  it('names conflicts by node and path', () => {
    expect(conflictId('a', ['style', 'color'])).toBe('["a",["style","color"]]');
    expect(conflictId(null, ['structure'])).toBe('[null,["structure"]]');
  });

  it('merges objects per property and records only real conflicts', () => {
    const into = resolution();
    const merged = mergeValue(
      { base: { a: 1, b: 1 }, local: { a: 2, b: 1 }, remote: { a: 1, b: 3, c: 4 } },
      { nodeId: 'n', path: ['style'] },
      into,
    );
    expect(merged).toEqual({ a: 2, b: 3, c: 4 });
    expect(into.conflicts).toEqual([]);
    const clash = resolution({ [conflictId('n', ['title'])]: 'remote' });
    const title = mergeValue(
      { base: 'A', local: 'B', remote: 'C' },
      { nodeId: 'n', path: ['title'] },
      clash,
    );
    expect(title).toBe('C');
    expect(clash.conflicts).toEqual([]);
    const open = resolution();
    expect(
      mergeValue({ base: 'A', local: 'B', remote: 'C' }, { nodeId: null, path: [] }, open),
    ).toBe('B');
    expect(open.conflicts).toMatchObject([{ id: conflictId(null, []), local: 'B', remote: 'C' }]);
  });

  it('rebuilds child lists without touching the input map', () => {
    const map = addNode(addNode(createMap('Root'), 'root', 'a', 'A'), 'root', 'b', 'B');
    const flat = {
      ...map,
      nodes: Object.fromEntries(
        Object.entries(map.nodes).map(([id, node]) => [id, { ...node, children: [] }]),
      ),
    };
    const rebuilt = rebuildTree(flat)!;
    expect(rebuilt.nodes.root.children).toEqual(['a', 'b']);
    expect(flat.nodes.root.children).toEqual([]);
    expect(
      rebuildTree({ ...flat, nodes: { ...flat.nodes, a: { ...flat.nodes.a, parentId: 'gone' } } }),
    ).toBeNull();
  });

  it('reads markers without any pixel sizes', () => {
    expect(nodeMarkers({ icon: '⭐', task: 'done' })).toEqual({ icon: '⭐', task: 'done' });
    expect(nodeMarkers({ icon: '<b>', task: 'later' })).toEqual({ icon: null, task: null });
  });
});
