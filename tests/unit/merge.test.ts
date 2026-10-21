import { describe, expect, it } from 'vitest';
import {
  createMap,
  addNode,
  renameNode,
  updateNode,
  deleteNode,
  moveNode,
} from '../../src/domain/commands';
import { changedNodes, mergeMaps } from '../../src/domain/merge';
import { mergeHistory } from '../../src/application/merge-history';
import { commit, createHistory, undo, redo } from '../../src/application/history';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';

const base = addNode(addNode(createMap('Root'), 'root', 'a', 'A'), 'root', 'b', 'B');
const valid = (map: typeof base) => expect(() => parseMaplet(serializeMaplet(map))).not.toThrow();

describe('three-way node/property merge', () => {
  it('merges edits to separate nodes without mutating any input', () => {
    const local = renameNode(base, 'a', 'Mine'),
      remote = renameNode(base, 'b', 'Theirs');
    const before = structuredClone([base, local, remote]);
    const result = mergeMaps(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.map.nodes.a.title).toBe('Mine');
    expect(result.map.nodes.b.title).toBe('Theirs');
    expect([base, local, remote]).toEqual(before);
    valid(result.map);
  });
  it('treats IDs named like inherited object members as absent when deleted', () => {
    for (const id of ['plain', 'toString', 'valueOf']) {
      const withNode = addNode(base, 'root', id, 'Inherited name');
      const deleted = mergeMaps(withNode, withNode, base);
      expect(deleted.conflicts).toEqual([]);
      expect(Object.hasOwn(deleted.map.nodes, id)).toBe(false);
      const added = mergeMaps(base, withNode, base);
      expect(added.conflicts).toEqual([]);
      expect(added.map.nodes[id].title).toBe('Inherited name');
    }
  });
  it('resolves every discovered conflict in one pass with a preferred side', () => {
    const local = renameNode(base, 'a', 'Mine'),
      remote = renameNode(base, 'a', 'Theirs');
    const result = mergeMaps(base, local, remote, {}, { prefer: 'remote' });
    expect(result.conflicts).toHaveLength(1);
    expect(result.map.nodes.a.title).toBe('Theirs');
    expect(mergeMaps(base, local, remote, {}, { prefer: 'local' }).map.nodes.a.title).toBe('Mine');
  });
  it('gives the same result when reusing a precomputed remote diff', () => {
    const local = renameNode(deleteNode(base, 'b'), 'a', 'Mine');
    const remote = addNode(renameNode(base, 'a', 'Theirs'), 'a', 'c', 'C');
    const remoteChanges = changedNodes(base, remote);
    expect([...remoteChanges].sort()).toEqual(['a', 'c']);
    for (const prefer of ['local', 'remote'] as const)
      expect(mergeMaps(base, local, remote, {}, { prefer, remoteChanges })).toEqual(
        mergeMaps(base, local, remote, {}, { prefer }),
      );
  });
  it('merges distinct properties and individual nested style keys on the same node', () => {
    const local = updateNode(renameNode(base, 'a', 'Mine'), 'a', {
      style: { color: 'red', nested: { x: 1 } },
    });
    const remote = updateNode(base, 'a', {
      notes: 'Remote note',
      style: { width: 240, nested: { y: 2 } },
    });
    const result = mergeMaps(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.map.nodes.a).toMatchObject({
      title: 'Mine',
      notes: 'Remote note',
      style: { color: 'red', width: 240, nested: { x: 1, y: 2 } },
    });
  });
  it('recognizes identical concurrent changes and object key reordering', () => {
    const local = updateNode(base, 'a', { style: { color: 'red', width: 240 } });
    const remote = updateNode(base, 'a', { style: { width: 240, color: 'red' } });
    expect(mergeMaps(base, local, remote).conflicts).toEqual([]);
  });
  it('reports only the conflicting property and preserves other edits after resolution', () => {
    const local = renameNode(base, 'a', 'Mine');
    const remote = updateNode(renameNode(base, 'a', 'Theirs'), 'b', { notes: 'Keep this' });
    const result = mergeMaps(base, local, remote);
    expect(result.conflicts.map((item) => [item.nodeId, item.path])).toEqual([['a', ['title']]]);
    const resolved = mergeMaps(base, local, remote, { [result.conflicts[0].id]: 'remote' });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.map.nodes.a.title).toBe('Theirs');
    expect(resolved.map.nodes.b.notes).toBe('Keep this');
  });
  it('treats a position as one value rather than mixing separate drags', () => {
    const positioned = structuredClone(base);
    positioned.nodes.a.position = { x: 10, y: 20 };
    const local = structuredClone(positioned),
      remote = structuredClone(positioned);
    local.nodes.a.position = { x: 30, y: 20 };
    remote.nodes.a.position = { x: 10, y: 40 };
    expect(mergeMaps(positioned, local, remote).conflicts[0].path).toEqual(['position']);
  });
  it('merges independent additions with colliding ranks into a valid deterministic tree', () => {
    const local = addNode(base, 'root', 'c', 'C'),
      remote = addNode(base, 'root', 'd', 'D');
    const result = mergeMaps(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.map.nodes.root.children).toEqual(['a', 'b', 'c', 'd']);
    valid(result.map);
  });
  it('combines a node move with an independent title change', () => {
    const result = mergeMaps(base, moveNode(base, 'a', 'b'), renameNode(base, 'a', 'Moved title'));
    expect(result.conflicts).toEqual([]);
    expect(result.map.nodes.a).toMatchObject({ parentId: 'b', title: 'Moved title' });
    valid(result.map);
  });
  it('detects delete versus edit and lets either side win without losing unrelated notes', () => {
    const local = deleteNode(base, 'a'),
      remote = updateNode(renameNode(base, 'a', 'Edited'), 'b', { notes: 'Keep' });
    const result = mergeMaps(base, local, remote);
    expect(result.conflicts).toHaveLength(1);
    for (const choice of ['local', 'remote'] as const) {
      const resolved = mergeMaps(base, local, remote, { [result.conflicts[0].id]: choice });
      expect(resolved.conflicts).toEqual([]);
      expect(Boolean(resolved.map.nodes.a)).toBe(choice === 'remote');
      expect(resolved.map.nodes.b.notes).toBe('Keep');
      valid(resolved.map);
    }
  });
  it('detects parent deletion against a newly added child', () => {
    const result = mergeMaps(base, deleteNode(base, 'a'), addNode(base, 'a', 'c', 'New child'));
    expect(result.conflicts.some((item) => item.path[0] === 'structure')).toBe(true);
    valid(result.map);
  });
  it('detects cross-node moves that would form a cycle and resolves topology as a transaction', () => {
    const local = moveNode(base, 'a', 'b'),
      remote = renameNode(moveNode(base, 'b', 'a'), 'root', 'Remote root');
    const result = mergeMaps(base, local, remote);
    const conflict = result.conflicts.find((item) => item.path[0] === 'structure')!;
    expect(conflict).toBeDefined();
    const resolved = mergeMaps(base, local, remote, { [conflict.id]: 'remote' });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.map.nodes.b.parentId).toBe('a');
    expect(resolved.map.nodes.root.title).toBe('Remote root');
    valid(resolved.map);
  });
  it('preserves unrelated additions when resolving a structural cycle', () => {
    const local = moveNode(base, 'a', 'b');
    const remote = addNode(moveNode(base, 'b', 'a'), 'root', 'c', 'Independent');
    const result = mergeMaps(base, local, remote);
    const conflict = result.conflicts.find((item) => item.path[0] === 'structure')!;
    const resolved = mergeMaps(base, local, remote, { [conflict.id]: 'local' });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.map.nodes.c.title).toBe('Independent');
    valid(resolved.map);
  });
  it('preserves remote edits through local undo/redo', () => {
    const local = renameNode(base, 'a', 'My title');
    const merged = mergeMaps(base, local, updateNode(base, 'b', { notes: 'Remote note' })).map;
    const history = mergeHistory(commit(createHistory(base), local), local, merged);
    const previous = undo(history);
    expect(previous.present.nodes.a.title).toBe('A');
    expect(previous.present.nodes.b.notes).toBe('Remote note');
    expect(redo(previous).present.nodes.a.title).toBe('My title');
    expect(redo(previous).present.nodes.b.notes).toBe('Remote note');
  });
  it('preserves newer edits made while a merged snapshot was saving', () => {
    const saved = renameNode(base, 'a', 'Snapshot');
    const current = renameNode(saved, 'a', 'Newer edit');
    const incoming = updateNode(saved, 'b', { notes: 'Remote note' });
    const history = mergeHistory(createHistory(current), saved, incoming);
    expect(history.present.nodes.a.title).toBe('Newer edit');
    expect(history.present.nodes.b.notes).toBe('Remote note');
  });
  it('resolves overlapping branch moves as one group while retaining other properties', () => {
    const positioned = addNode(base, 'a', 'leaf', 'Leaf');
    positioned.nodes.a.position = { x: 10, y: 10 };
    positioned.nodes.leaf.position = { x: 20, y: 20 };
    const local = structuredClone(positioned),
      remote = structuredClone(positioned);
    local.nodes.a.position = { x: 110, y: 10 };
    local.nodes.leaf.position = { x: 120, y: 20 };
    remote.nodes.leaf.position = { x: 20, y: 70 };
    remote.nodes.a.notes = 'Keep note';
    const pending = mergeMaps(positioned, local, remote);
    expect(pending.conflicts).toHaveLength(1);
    expect(pending.conflicts[0].path).toEqual(['position', 'group']);
    const resolved = mergeMaps(positioned, local, remote, { [pending.conflicts[0].id]: 'remote' });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.map.nodes.a.position).toEqual(positioned.nodes.a.position);
    expect(resolved.map.nodes.leaf.position).toEqual(remote.nodes.leaf.position);
    expect(resolved.map.nodes.a.notes).toBe('Keep note');
    valid(resolved.map);
  });
});
