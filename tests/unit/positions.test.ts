import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMap, addNode, renameNode, updateNode } from '../../src/domain/commands';
import { setNodePositions, resetNodePositions } from '../../src/domain/positions';
import { createHistory, commit, undo, redo } from '../../src/application/history';
import { layoutMap, moveLayoutSubtree } from '../../src/engine/layout';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';

function example() {
  let map = addNode(createMap(), 'root', 'a', '첫 가지');
  map = addNode(map, 'a', 'child', '하위 항목');
  return addNode(map, 'root', 'b', '둘째 가지');
}
const positionsOf = (map: ReturnType<typeof createMap>) =>
  Object.fromEntries(layoutMap(map).nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

describe('manual node positions and connection lengths', () => {
  it('moves exactly one node while preserving topology and all other positions', () => {
    const original = example();
    const positions = positionsOf(original);
    const moved = setNodePositions(original, {
      ...positions,
      a: { x: positions.a.x + 180, y: positions.a.y + 70 },
    });
    const layout = layoutMap(moved);
    expect(layout.nodes.find((node) => node.id === 'a')).toMatchObject({
      x: positions.a.x + 180,
      y: positions.a.y + 70,
    });
    for (const id of ['root', 'b', 'child'])
      expect(layout.nodes.find((node) => node.id === id)).toMatchObject(positions[id]);
    expect(moved.nodes.a.parentId).toBe('root');
    expect(moved.nodes.a.children).toEqual(['child']);
    expect(original.nodes.a.position).toBeNull();
    expect(layout.edges.find((edge) => edge.to === 'a')!.path).not.toBe(
      layoutMap(original).edges.find((edge) => edge.to === 'a')!.path,
    );
  });
  it('supports negative coordinates and routes connections to the new side', () => {
    const source = example();
    const positions = positionsOf(source);
    const map = setNodePositions(source, { ...positions, a: { x: -400, y: positions.root.y } });
    const layout = layoutMap(map);
    const root = layout.nodes.find((node) => node.id === 'root')!;
    const node = layout.nodes.find((node) => node.id === 'a')!;
    expect(node.x).toBe(-400);
    expect(layout.minX).toBeLessThan(-400);
    expect(layout.edges.find((edge) => edge.to === 'a')!.path).toMatch(new RegExp(`^M ${root.x} `));
    expect(node.side).toBe('left');
  });
  it('keeps manual coordinates after renaming, collapsing and adding a node', () => {
    const source = example();
    const positions = positionsOf(source);
    let map = setNodePositions(source, { ...positions, a: { x: -180, y: 220 } });
    map = renameNode(map, 'a', '少し長いタイトルと한국어를 포함한 새로운 제목');
    map = updateNode(map, 'a', { collapsed: true });
    map = updateNode(map, 'a', { collapsed: false });
    map = addNode(map, 'a', 'new', '추가');
    const layout = layoutMap(map);
    expect(layout.nodes.find((node) => node.id === 'a')).toMatchObject({ x: -180, y: 220 });
    for (const id of ['root', 'b', 'child'])
      expect(layout.nodes.find((node) => node.id === id)).toMatchObject(positions[id]);
    const added = layout.nodes.find((node) => node.id === 'new')!;
    for (const node of layout.nodes.filter((node) => node.id !== 'new'))
      expect(
        added.x + added.width <= node.x ||
          node.x + node.width <= added.x ||
          added.y + added.height <= node.y ||
          node.y + node.height <= added.y,
      ).toBe(true);
  });
  it('previews movement and connected lines without changing the document', () => {
    const map = example();
    const base = layoutMap(map);
    const preview = moveLayoutSubtree(map, base, 'a', { x: 900, y: -200 });
    expect(preview.nodes.find((node) => node.id === 'a')).toMatchObject({ x: 900, y: -200 });
    expect(base.nodes.find((node) => node.id === 'a')!.x).not.toBe(900);
    expect(
      preview.edges
        .filter((edge) => edge.from === 'a' || edge.to === 'a')
        .every((edge) => edge.path !== base.edges.find((old) => old.to === edge.to)!.path),
    ).toBe(true);
    expect(map.nodes.a.position).toBeNull();
  });
  it('places an explicitly redirected branch on its chosen side after manual movement', () => {
    const source = example();
    const positions = positionsOf(source);
    const moved = setNodePositions(source, positions);
    const changed = updateNode(moved, 'a', { side: 'left' });
    const layout = layoutMap(changed);
    const root = layout.nodes.find((node) => node.id === 'root')!;
    const branch = layout.nodes.find((node) => node.id === 'a')!;
    expect(branch.x + branch.width).toBeLessThan(root.x);
    expect(changed.nodes.child.position).toBeNull();
    expect(changed.nodes.b.position).toEqual(positions.b);
  });
  it('undoes a whole drag in one step and can restore automatic layout', () => {
    const map = example();
    const moved = setNodePositions(map, { ...positionsOf(map), a: { x: 800, y: 300 } });
    const history = commit(createHistory(map), moved);
    expect(undo(history).present).toEqual(map);
    expect(redo(undo(history)).present).toEqual(moved);
    expect(
      Object.values(resetNodePositions(moved).nodes).every((node) => node.position === null),
    ).toBe(true);
    expect(resetNodePositions(map)).toBe(map);
    expect(setNodePositions(moved, { a: { x: 800, y: 300 } })).toBe(moved);
  });
  it('rejects invalid positions atomically', () => {
    const map = example();
    for (const point of [
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: 0, y: 1_000_001 },
    ])
      expect(() => setNodePositions(map, { a: point })).toThrow();
    expect(() => setNodePositions(map, { missing: { x: 1, y: 2 } })).toThrow();
    expect(map.nodes.a.position).toBeNull();
  });
});

describe('MUP manual position extension', () => {
  it.each(['v1.mup', 'v2-rich.mup', 'v3-multi.mup'])(
    'persists positions in %s without losing original attributes',
    (file) => {
      const source = readFileSync(`tests/fixtures/${file}`, 'utf8');
      const map = parseMup(source);
      const id = map.roots[0];
      const moved = setNodePositions(map, { [id]: { x: -150.5, y: 270.25 } });
      const reopened = parseMup(serializeMup(moved));
      expect(reopened.nodes[id].position).toEqual({ x: -150.5, y: 270.25 });
      expect(reopened.nodes[id].rawExtensions).toMatchObject(map.nodes[id].rawExtensions);
      expect(map.original).toBe(source);
    },
  );
  it('preserves unknown fields inside the position extension when moving and resetting', () => {
    const raw = {
      id: 1,
      title: 'root',
      attr: { 'maplet:position': { x: 10, y: 20, vendor: 'keep' }, other: true },
    };
    const map = parseMup(JSON.stringify(raw));
    const moved = setNodePositions(map, { '1': { x: 30, y: 40 } });
    expect(JSON.parse(serializeMup(moved)).attr['maplet:position']).toEqual({
      x: 30,
      y: 40,
      vendor: 'keep',
    });
    expect(JSON.parse(serializeMup(resetNodePositions(moved))).attr).toMatchObject({
      'maplet:position': { vendor: 'keep' },
      other: true,
    });
  });
  it('does not add position metadata to untouched maps and preserves unsupported metadata', () => {
    const raw = { id: 1, title: 'root', attr: { 'maplet:position': { x: 'invalid', y: 1 } } };
    const map = parseMup(JSON.stringify(raw));
    expect(map.nodes['1'].position).toBeNull();
    expect(JSON.parse(serializeMup(map))).toEqual(raw);
    expect(JSON.parse(serializeMup(createMap())).attr).toBeUndefined();
  });
});
