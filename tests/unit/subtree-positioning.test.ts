import { expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { positionsForSubtreeMove, setNodePositions } from '../../src/domain/positions';
import { layoutMap, moveLayoutSubtree } from '../../src/engine/layout';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';
import { commit, createHistory, undo, redo } from '../../src/application/history';

function example() {
  let map = addNode(createMap(), 'root', 'a');
  map = addNode(map, 'a', 'child');
  map = addNode(map, 'child', 'grandchild');
  return addNode(map, 'root', 'b');
}
const points = (layout: ReturnType<typeof layoutMap>) =>
  Object.fromEntries(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

it('moves the whole branch live without changing its internal offsets, siblings or document', () => {
  const map = example();
  const base = layoutMap(map);
  const before = points(base);
  const target = { x: before.a.x - 420, y: before.a.y + 110 };
  const preview = moveLayoutSubtree(map, base, 'a', target);
  const after = points(preview);
  for (const id of ['a', 'child', 'grandchild'])
    expect(after[id]).toEqual({ x: before[id].x - 420, y: before[id].y + 110 });
  for (const id of ['root', 'b']) expect(after[id]).toEqual(before[id]);
  expect(points(base)).toEqual(before);
  expect(map.nodes.a.position).toBeNull();
  expect(preview.edges.find((edge) => edge.to === 'a')!.path).not.toBe(
    base.edges.find((edge) => edge.to === 'a')!.path,
  );
  const next = moveLayoutSubtree(map, base, 'a', { x: target.x + 10, y: target.y });
  expect(points(next).child.x).toBe(after.child.x + 10);
});

it('commits a whole subtree once and restores all positions with Undo/Redo and file round trips', () => {
  const map = example();
  const before = points(layoutMap(map));
  const positions = positionsForSubtreeMove(map, before, 'a', {
    x: before.a.x + 150,
    y: before.a.y - 65,
  });
  const moved = setNodePositions(map, positions);
  for (const id of ['a', 'child', 'grandchild'])
    expect(moved.nodes[id].position).toEqual({ x: before[id].x + 150, y: before[id].y - 65 });
  for (const id of ['root', 'b']) expect(moved.nodes[id].position).toEqual(before[id]);
  expect(moved.nodes.a.parentId).toBe('root');
  expect(moved.nodes.child.parentId).toBe('a');
  const history = commit(createHistory(map), moved);
  expect(undo(history).present).toEqual(map);
  expect(redo(undo(history)).present).toEqual(moved);
  expect(points(layoutMap(parseMup(serializeMup(moved))))).toEqual(positions);
});

it('moves saved positions of collapsed descendants and keeps unpositioned descendants automatic', () => {
  let map = example();
  const before = points(layoutMap(map));
  map = setNodePositions(map, before);
  map = updateNode(map, 'a', { collapsed: true });
  const visible = points(layoutMap(map));
  const moved = setNodePositions(
    map,
    positionsForSubtreeMove(map, visible, 'a', { x: before.a.x + 100, y: before.a.y + 70 }),
  );
  expect(points(layoutMap(moved)).child).toBeUndefined();
  const reopened = updateNode(parseMup(serializeMup(moved)), 'a', { collapsed: false });
  for (const id of ['child', 'grandchild'])
    expect(points(layoutMap(reopened))[id]).toEqual({
      x: before[id].x + 100,
      y: before[id].y + 70,
    });
  expect(reopened.nodes.b.position).toEqual(before.b);

  const automatic = updateNode(example(), 'a', { collapsed: true });
  const snapshot = points(layoutMap(automatic));
  const automaticMoved = setNodePositions(
    automatic,
    positionsForSubtreeMove(automatic, snapshot, 'a', { x: -300, y: 200 }),
  );
  expect(automaticMoved.nodes.child.position).toBeNull();
  const expanded = points(layoutMap(updateNode(automaticMoved, 'a', { collapsed: false })));
  expect(expanded.child.x).toBeGreaterThan(expanded.a.x);
});

it('moves only the selected root and its descendants in a multiple-root document', () => {
  const map = parseMup(
    JSON.stringify({
      formatVersion: 3,
      ideas: {
        '1': { id: 'one', title: 'one', ideas: { '1': { id: 'child', title: 'child' } } },
        '2': { id: 'two', title: 'two' },
      },
    }),
  );
  const before = points(layoutMap(map));
  const after = positionsForSubtreeMove(map, before, 'one', {
    x: before.one.x + 100,
    y: before.one.y + 90,
  });
  expect(after.child).toEqual({ x: before.child.x + 100, y: before.child.y + 90 });
  expect(after.two).toEqual(before.two);
  expect(() => positionsForSubtreeMove(map, before, 'missing', { x: 0, y: 0 })).toThrow();
});
