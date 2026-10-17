import { describe, expect, it } from 'vitest';
import { layoutMap } from '../../src/engine/layout';
import { createMap, addNode, updateNode } from '../../src/domain/commands';

describe('readable two-sided layout', () => {
  it('places left and right branches, wraps text and avoids intersecting boxes', () => {
    let doc = createMap();
    for (let i = 0; i < 12; i++) {
      doc = addNode(
        doc,
        doc.roots[0],
        `a${i}`,
        '가독성을 확인하는 긴 한국어 제목입니다 '.repeat(3),
      );
      if (i % 2) doc = updateNode(doc, `a${i}`, { side: 'left' });
      for (let j = 0; j < 3; j++) doc = addNode(doc, `a${i}`, `b${i}-${j}`, '세부 생각');
    }
    const result = layoutMap(doc);
    const root = result.nodes.find((n) => n.id === doc.roots[0])!;
    expect(result.nodes.find((n) => n.id === 'a1')!.x).toBeLessThan(root.x);
    expect(result.nodes.find((n) => n.id === 'a0')!.x).toBeGreaterThan(root.x);
    expect(result.nodes.find((n) => n.id === 'a0')!.height).toBeGreaterThan(60);
    for (const a of result.nodes)
      for (const b of result.nodes) {
        if (a.id !== b.id)
          expect(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          ).toBe(true);
      }
  });
  it('hides collapsed descendants and lays out multiple roots', () => {
    let doc = createMap();
    doc = addNode(doc, doc.roots[0], 'a');
    doc = addNode(doc, 'a', 'b');
    doc = updateNode(doc, 'a', { collapsed: true });
    expect(layoutMap(doc).nodes.map((n) => n.id)).not.toContain('b');
    expect(layoutMap(doc).edges).toHaveLength(1);
  });
});
