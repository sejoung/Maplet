import { describe, expect, it } from 'vitest';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { setNodePositions } from '../../src/domain/positions';
import { autoArrange } from '../../src/engine/auto-arrange';
import { layoutMap } from '../../src/engine/layout';
import { measureTree, BRANCH_GAP } from '../../src/engine/tree-measure';
import { commit, createHistory, redo, undo } from '../../src/application/history';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';

function unevenMap() {
  let map = createMap('Root');
  for (let i = 0; i < 6; i++) map = addNode(map, 'root', `branch-${i}`, `Branch ${i}`);
  for (let i = 0; i < 8; i++) map = addNode(map, 'branch-0', `leaf-${i}`, `Detail ${i}`);
  return map;
}
function expectClear(map: ReturnType<typeof createMap>) {
  const { nodes } = layoutMap(map);
  for (let i = 0; i < nodes.length; i++)
    for (const b of nodes.slice(i + 1)) {
      const a = nodes[i];
      expect(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      ).toBe(true);
    }
}

describe('whole-map automatic arrangement', () => {
  it('balances by subtree height instead of merely splitting the number of children', () => {
    const original = unevenMap();
    const arranged = autoArrange(original);
    expect(arranged.nodes['branch-0'].side).toBe('right');
    for (let i = 1; i < 6; i++) expect(arranged.nodes[`branch-${i}`].side).toBe('left');
    expect(layoutMap(arranged).height).toBeLessThan(layoutMap(original).height);
    expectClear(arranged);
    expect(autoArrange(arranged)).toBe(arranged);
    expect(original.nodes['branch-1'].side).toBe('right');
  });

  it('uses actual wrapping and typography measurements for branch weights', () => {
    let map = createMap();
    for (let i = 0; i < 4; i++)
      map = addNode(map, 'root', `b${i}`, 'Long title that wraps '.repeat(i === 0 ? 8 : 1));
    map = updateNode(map, 'b0', { style: { width: 100, fontSize: 28 } });
    const measure = (text: string) => text.length * 14;
    const arranged = autoArrange(map, measure);
    expect(arranged.nodes.b0.side).toBe('right');
    expect(['b1', 'b2', 'b3'].every((id) => arranged.nodes[id].side === 'left')).toBe(true);
    const sizes = measureTree(arranged, measure);
    expect(sizes.get('b0')!.span).toBeGreaterThan(200);
  });

  it('keeps complete branches separated with extra space between their envelopes', () => {
    const map = autoArrange(unevenMap());
    const layout = layoutMap(map);
    const sizes = measureTree(map);
    for (const side of ['left', 'right']) {
      const branches = map.nodes.root.children.filter((id) => map.nodes[id].side === side);
      for (let i = 1; i < branches.length; i++) {
        const a = layout.nodes.find((node) => node.id === branches[i - 1])!;
        const b = layout.nodes.find((node) => node.id === branches[i])!;
        expect(
          b.y +
            b.height / 2 -
            (a.y + a.height / 2) -
            (sizes.get(a.id)!.span + sizes.get(b.id)!.span) / 2,
        ).toBeGreaterThanOrEqual(BRANCH_GAP - 1e-6);
      }
    }
    expectClear(map);
  });

  it('removes hidden manual coordinates and preserves collapsed state, content, hierarchy and extensions', () => {
    let map = unevenMap();
    map = updateNode(map, 'branch-0', {
      collapsed: true,
      notes: 'Private note',
      style: { width: 310, background: '#abc' },
    });
    map.nodes['leaf-0'].rawExtensions = { custom: ['preserved'] };
    map = setNodePositions(
      map,
      Object.fromEntries(Object.keys(map.nodes).map((id) => [id, { x: 10, y: -20 }])),
    );
    const arranged = autoArrange(map);
    for (const id of Object.keys(map.nodes)) {
      expect(arranged.nodes[id].position).toBeNull();
      for (const key of [
        'title',
        'children',
        'parentId',
        'collapsed',
        'notes',
        'links',
        'style',
        'rawExtensions',
      ] as const)
        expect(arranged.nodes[id][key]).toEqual(map.nodes[id][key]);
    }
    const visible = layoutMap(arranged).nodes.map((node) => node.id);
    expect(visible).not.toContain('leaf-0');
    expectClear(updateNode(arranged, 'branch-0', { collapsed: false }));
    expect(arranged.nodes['leaf-0'].side).toBe(arranged.nodes['branch-0'].side);
    expect(undo(commit(createHistory(map), arranged)).present).toEqual(map);
  });

  it('preserves sibling order and directions through native and MUP round trips', () => {
    const arranged = autoArrange(unevenMap());
    for (const restored of [
      parseMaplet(serializeMaplet(arranged)),
      parseMup(serializeMup(arranged)),
    ]) {
      expect(restored.nodes.root.children).toEqual(arranged.nodes.root.children);
      for (const id of Object.keys(arranged.nodes))
        expect(restored.nodes[id].side).toBe(arranged.nodes[id].side);
      expect(layoutMap(restored)).toEqual(layoutMap(arranged));
    }
    const history = commit(createHistory(unevenMap()), arranged);
    expect(redo(undo(history)).present).toEqual(arranged);
  });

  it('handles several roots and collapsed roots independently without moving content into another tree', () => {
    const map = unevenMap();
    const second = unevenMap();
    const renamed = Object.fromEntries(
      Object.values(second.nodes).map((node) => [
        `other-${node.id}`,
        {
          ...node,
          id: `other-${node.id}`,
          originalId: `other-${node.id}`,
          parentId: node.parentId && `other-${node.parentId}`,
          children: node.children.map((id) => `other-${id}`),
        },
      ]),
    );
    const forest = {
      ...map,
      roots: [...map.roots, 'other-root'],
      nodes: { ...map.nodes, ...renamed },
    };
    forest.nodes['other-root'].rank = '2';
    forest.nodes.root.collapsed = true;
    const arranged = autoArrange(forest);
    expect(layoutMap(arranged).nodes).toHaveLength(Object.keys(second.nodes).length + 1);
    expect(arranged.nodes['branch-0'].side).toBe(arranged.nodes['other-branch-0'].side);
    expectClear(arranged);
    expectClear(updateNode(arranged, 'root', { collapsed: false }));
  });
});

it('routes automatic connectors in the gaps without cutting through unrelated nodes', () => {
  const layout = layoutMap(autoArrange(unevenMap()));
  for (const edge of layout.edges) {
    const coordinates = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = coordinates;
    for (let step = 1; step < 40; step++) {
      const t = step / 40,
        u = 1 - t;
      const x = u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3;
      const y = u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3;
      for (const node of layout.nodes.filter(
        (node) => node.id !== edge.from && node.id !== edge.to,
      ))
        expect(
          x > node.x && x < node.x + node.width && y > node.y && y < node.y + node.height,
        ).toBe(false);
    }
  }
});
