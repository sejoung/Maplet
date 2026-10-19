import { describe, expect, it } from 'vitest';
import { createMap, addNode, updateNode } from '../../src/domain/commands';
import { resizeNode } from '../../src/domain/node-size';
import { layoutMap } from '../../src/engine/layout';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';
import { createHistory, commit, undo, redo } from '../../src/application/history';

describe('manual node dimensions', () => {
  it('reflows text to the requested width and grows height to keep all lines visible', () => {
    const map = createMap('가나다라마바사아자차카타파하'.repeat(3));
    const narrow = layoutMap(resizeNode(map, 'root', { width: 120, height: 56 })).nodes[0];
    const wide = layoutMap(resizeNode(map, 'root', { width: 400, height: 160 })).nodes[0];
    expect(narrow.width).toBe(120);
    expect(narrow.lines.join('')).toBe(map.nodes.root.title);
    expect(narrow.height).toBeGreaterThan(56);
    expect(wide.width).toBe(400);
    expect(wide.lines.length).toBeLessThan(narrow.lines.length);
    expect(wide.height).toBe(160);
  });

  it('keeps anchored positions and edges attached and records one complete undo transaction', () => {
    const map = addNode(createMap(), 'root', 'child');
    const before = layoutMap(map);
    const positions = Object.fromEntries(before.nodes.map(({ id, x, y }) => [id, { x, y }]));
    const resized = resizeNode(map, 'child', { width: 350, height: 150 }, positions);
    const after = layoutMap(resized);
    expect(after.nodes.map(({ x, y }) => ({ x, y }))).toEqual(Object.values(positions));
    expect(after.edges[0].path).not.toBe(before.edges[0].path);
    expect(map.nodes.child.style).toEqual({});
    const history = commit(createHistory(map), resized);
    expect(undo(history).present).toBe(map);
    expect(redo(undo(history)).present).toBe(resized);
  });

  it('restores automatic size without discarding other formatting or metadata', () => {
    const map = updateNode(createMap(), 'root', {
      style: { width: 320, height: 150, fontSize: 20, vendor: { keep: true } },
    });
    const restored = resizeNode(map, 'root', null);
    expect(restored.nodes.root.style).toEqual({ fontSize: 20, vendor: { keep: true } });
    expect(resizeNode(restored, 'root', null)).toBe(restored);
  });

  it('preserves dimensions through native and compatibility files', () => {
    const map = resizeNode(createMap(), 'root', { width: 350, height: 150 });
    const reopened = parseMaplet(serializeMaplet(map));
    expect(layoutMap(reopened)).toEqual(layoutMap(map));
    expect(layoutMap(parseMup(serializeMup(reopened))).nodes[0]).toMatchObject({
      width: 350,
      height: 150,
    });
  });

  it('rejects invalid edits and safely ignores unsupported imported dimensions', () => {
    const map = createMap();
    for (const size of [
      { width: NaN, height: 100 },
      { width: 119, height: 56 },
      { width: 1210, height: 56 },
      { width: 200, height: -1 },
    ])
      expect(() => resizeNode(map, 'root', size)).toThrow();
    expect(() => resizeNode(map, 'missing', null)).toThrow();
    expect(layoutMap(updateNode(map, 'root', { style: { width: '300', height: -30 } }))).toEqual(
      layoutMap(map),
    );
  });
});
