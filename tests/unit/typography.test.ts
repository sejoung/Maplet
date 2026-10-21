import { describe, expect, it } from 'vitest';
import { nodeTypography } from '../../src/domain/typography';
import { createMap, updateNode } from '../../src/domain/commands';
import { layoutMap } from '../../src/engine/layout';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { parseMup, serializeMup } from '../../src/adapters/mup/codec';

describe('node typography and layout', () => {
  it('uses safe defaults for missing or unsupported imported values without changing the file', () => {
    const style = { textAlign: 'justify', fontSize: 9999, fontFamily: 'url(https://example.com)' };
    const map = updateNode(createMap(), 'root', { style });
    expect(nodeTypography(style)).toEqual({
      textAlign: 'left',
      fontSize: 15,
      fontFamily: 'sans',
      bold: false,
      italic: false,
      lineHeight: 23,
    });
    expect(layoutMap(map)).toEqual(layoutMap(createMap()));
    expect(parseMaplet(serializeMaplet(map)).nodes.root.style).toEqual(style);
  });

  it('wraps and grows large text while keeping connector endpoints on the resized boxes', () => {
    const title = '크기가 바뀌어도 제목 전체를 읽을 수 있어야 합니다';
    const map = parseMup(JSON.stringify({ id: 1, title, ideas: { 1: { id: 2, title } } }));
    const before = layoutMap(map).nodes[0];
    const after = layoutMap(updateNode(map, '1', { style: { fontSize: 20 } }));
    const root = after.nodes[0];
    expect(root.lines.join('')).toBe(title);
    expect(root.height).toBeGreaterThan(before.height);
    expect(root.width).toBeLessThanOrEqual(236);
    expect(after.edges[0].path).toMatch(new RegExp(`^M ${root.x + root.width} `));
    expect(after.nodes[1].x).toBeGreaterThan(root.x + root.width);
  });

  it.each([1, 2, 3])(
    'preserves typography and unknown styles through native and MUP v%i saves',
    (version) => {
      const root = { id: 1, title: 'Topic' };
      const map = parseMup(
        JSON.stringify(
          version === 3
            ? { formatVersion: version, ideas: { 1: root } }
            : { formatVersion: version, ...root },
        ),
      );
      const style = {
        textAlign: 'right',
        fontSize: 20,
        fontFamily: 'serif',
        vendor: { keep: true },
      };
      const edited = updateNode(map, '1', { style });
      const native = parseMaplet(serializeMaplet(edited));
      expect(native.nodes['1'].style).toEqual(style);
      expect(parseMup(serializeMup(native)).nodes['1'].style).toEqual(style);
      expect(nodeTypography(native.nodes['1'].style)).toMatchObject({
        textAlign: 'right',
        fontSize: 20,
        fontFamily: 'serif',
      });
    },
  );
});
