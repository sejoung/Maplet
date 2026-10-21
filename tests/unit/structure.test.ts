import { describe, expect, it } from 'vitest';
import {
  addNode,
  addRoot,
  createMap,
  deleteNodes,
  insertNodes,
  showLevels,
  updateNode,
} from '../../src/domain/commands';
import { addConnection, removeConnection } from '../../src/domain/connections';
import { setNodePositions } from '../../src/domain/positions';
import { mergeMaps } from '../../src/domain/merge';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';

let base = addNode(createMap('Root'), 'root', 'a', 'A');
base = addNode(base, 'a', 'a1', 'A1');
base = addNode(base, 'a1', 'a2', 'A2');
base = addNode(base, 'root', 'b', 'B');
base = addNode(base, 'root', 'c', 'C');
base = addNode(base, 'b', 'b1', 'B1');
const valid = (map: typeof base) => parseMaplet(serializeMaplet(map));

describe('inserting beside a sibling', () => {
  it('places branches before or after an anchor and keeps valid ranks', () => {
    const before = insertNodes(base, ['a1'], 'root', { id: 'b', after: false });
    expect(before.nodes.root.children).toEqual(['a', 'a1', 'b', 'c']);
    expect(before.nodes.a1).toMatchObject({ parentId: 'root', side: 'right' });
    expect(before.nodes.a.children).toEqual([]);
    expect(valid(before).nodes.root.children).toEqual(['a', 'a1', 'b', 'c']);
    const after = insertNodes(base, ['b1', 'a2'], 'root', { id: 'c', after: true });
    expect(after.nodes.root.children).toEqual(['a', 'b', 'c', 'b1', 'a2']);
  });

  it('reorders under the same parent and releases that side so the order shows', () => {
    const placed = setNodePositions(base, {
      a: { x: 10, y: 10 },
      a1: { x: 20, y: 20 },
      b: { x: 30, y: 30 },
    });
    const moved = insertNodes(placed, ['c'], 'root', { id: 'a', after: false });
    expect(moved.nodes.root.children).toEqual(['c', 'a', 'b']);
    expect([moved.nodes.a.position, moved.nodes.a1.position, moved.nodes.b.position]).toEqual([
      null,
      null,
      null,
    ]);
    expect(valid(moved).nodes.root.children).toEqual(['c', 'a', 'b']);
  });

  it('takes the anchor side under a root and refuses cycles and roots', () => {
    const left = updateNode(base, 'c', { side: 'left' });
    const moved = insertNodes(left, ['a2'], 'root', { id: 'c', after: false });
    expect(moved.nodes.a2.side).toBe('left');
    expect(() => insertNodes(base, ['a'], 'a1', { id: 'a2', after: true })).toThrow('순환');
    const twoRoots = addRoot(base, 'r2', 'Second');
    expect(() => insertNodes(twoRoots, ['r2'], 'a', { id: 'a1', after: true })).toThrow('중심');
    expect(() => insertNodes(base, ['b'], 'a', { id: 'b1', after: true })).toThrow('형제');
  });
});

describe('showing levels', () => {
  it('collapses below a depth, expands all, and limits the change to one branch', () => {
    const main = showLevels(base, 2);
    expect(['root', 'a', 'a1', 'b'].map((id) => main.nodes[id].collapsed)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(showLevels(main, null)).toEqual(base);
    const branch = showLevels(main, null, 'a');
    expect([branch.nodes.a.collapsed, branch.nodes.a1.collapsed, branch.nodes.b.collapsed]).toEqual(
      [false, false, true],
    );
    expect(showLevels(base, null)).toBe(base);
  });
});

describe('new central topics', () => {
  it('adds a root at a position and switches the document to multiple roots', () => {
    const map = addRoot(base, 'note', 'Note', { x: 500, y: 40 });
    expect(map.roots).toEqual(['root', 'note']);
    expect(map.formatVersion).toBe(3);
    expect(map.nodes.note).toMatchObject({ parentId: null, position: { x: 500, y: 40 } });
    expect(valid(map).roots).toEqual(['root', 'note']);
    expect(JSON.parse(serializeMup(map)).ideas).toHaveProperty('2');
    expect(() => addRoot(map, 'note', 'Again')).toThrow('ID');
  });
});

describe('cross-links', () => {
  it('adds, ignores repeats, removes and refuses self links', () => {
    const map = addConnection(base, 'a2', 'c');
    expect(map.connections).toEqual([{ from: 'a2', to: 'c' }]);
    expect(addConnection(map, 'a2', 'c')).toBe(map);
    expect(removeConnection(map, 'a2', 'c').connections).toEqual([]);
    expect(removeConnection(base, 'a2', 'c')).toBe(base);
    expect(() => addConnection(base, 'a', 'a')).toThrow('같은 노드');
  });

  it('drops links with deleted ends and survives native round trips', () => {
    let map = addConnection(base, 'a2', 'c');
    map = addConnection(map, 'b1', 'a');
    expect(deleteNodes(map, ['a1']).connections).toEqual([{ from: 'b1', to: 'a' }]);
    expect(valid(map).connections).toEqual(map.connections);
    expect(JSON.parse(serializeMaplet(base))).not.toHaveProperty('connections');
    const raw = JSON.parse(serializeMaplet(map));
    raw.connections.push({ from: 'a', to: 'missing' }, { from: 'a2', to: 'c' });
    expect(parseMaplet(JSON.stringify(raw)).connections).toHaveLength(2);
    raw.connections = [{ from: 'a', to: 'a' }];
    expect(() => parseMaplet(JSON.stringify(raw))).toThrow();
  });

  it('reads and writes MindMup links, keeping their attributes', () => {
    const source = JSON.stringify({
      formatVersion: 3,
      id: 'doc',
      ideas: {
        1: {
          id: 1,
          title: 'Root',
          ideas: { 1: { id: 2, title: 'Two' }, 2: { id: 3, title: 'Three' } },
        },
      },
      links: [
        { ideaIdFrom: 2, ideaIdTo: 3, attr: { style: { color: '#f00' } } },
        { ideaIdFrom: 2, ideaIdTo: 99 },
      ],
    });
    const map = parseMup(source);
    expect(map.connections).toEqual([{ from: '2', to: '3' }]);
    expect(map.warnings).toContain('연결할 노드가 없는 교차 연결은 원본에만 보존합니다.');
    expect(JSON.parse(serializeMup(map)).links).toEqual([
      { ideaIdFrom: 2, ideaIdTo: 3, attr: { style: { color: '#f00' } } },
    ]);
    const added = addConnection(map, '3', '1');
    expect(JSON.parse(serializeMup(added)).links[1]).toEqual({ ideaIdFrom: 3, ideaIdTo: 1 });
    expect(JSON.parse(serializeMup(removeConnection(map, '2', '3')))).not.toHaveProperty('links');
    const legacy = parseMup(
      JSON.stringify({
        id: 1,
        title: 'R',
        ideas: { 1: { id: 2, title: 'C' } },
        links: [{ ideaIdFrom: 2, ideaIdTo: 1 }],
      }),
    );
    expect(legacy.connections).toEqual([{ from: '2', to: '1' }]);
  });

  it('merges links as one value and drops those whose ends were deleted remotely', () => {
    const local = addConnection(base, 'a2', 'c');
    const remote = deleteNodes(base, ['c']);
    const { map } = mergeMaps(base, local, remote);
    expect(map.nodes.c).toBeUndefined();
    expect(map.connections ?? []).toEqual([]);
  });
});
