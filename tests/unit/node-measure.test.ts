import { describe, expect, it } from 'vitest';
import { createMap, updateNode } from '../../src/domain/commands';
import { resizeNode } from '../../src/domain/node-size';
import { measureNode, type TextMeasurer } from '../../src/engine/node-measure';

const measuredWidth: TextMeasurer = (text) =>
  [...text].reduce(
    (sum, char) => sum + (char === 'i' ? 3 : char === 'W' ? 14 : char === ' ' ? 4 : 10),
    0,
  );

describe('content fitting node measurements', () => {
  it('uses actual font advances rather than imposing a large minimum width on short labels', () => {
    const node = createMap('iiiiiiiiiiiiiiiiiiii').nodes.root;
    const measured = measureNode(node, measuredWidth);
    expect(measured.lines).toEqual([node.title]);
    expect(measured.width).toBe(86);
    expect(measured.height).toBe(37);
  });

  it('fills lines to the available width even when glyph widths differ substantially', () => {
    const map = resizeNode(createMap('iiiiWWiiiiWWiiiiWWiiiiWWiiiiWW'), 'root', 100);
    const result = measureNode(map.nodes.root, measuredWidth);
    expect(result.lines.join('')).toBe(map.nodes.root.title);
    for (const [index, line] of result.lines.entries()) {
      expect(measuredWidth(line, map.nodes.root)).toBeLessThanOrEqual(74);
      if (index < result.lines.length - 1)
        expect(measuredWidth(line + result.lines[index + 1][0], map.nodes.root)).toBeGreaterThan(
          74,
        );
    }
    expect(result.height).toBe(result.lines.length * 23 + 14);
  });

  it('ignores stale fixed heights and shrinks as widening reduces the number of lines', () => {
    const map = updateNode(createMap('A readable title with several lines of text'), 'root', {
      style: { width: 100, height: 900, vendor: true },
    });
    const narrow = measureNode(map.nodes.root, measuredWidth);
    const wideMap = resizeNode(map, 'root', 350);
    const wide = measureNode(wideMap.nodes.root, measuredWidth);
    expect(wide.height).toBeLessThan(narrow.height);
    expect(wide.height).toBe(wide.lines.length * 23 + 14);
    expect(map.nodes.root.style).toEqual({ width: 100, height: 900, vendor: true });
    expect(wideMap.nodes.root.style).toEqual({ width: 350, vendor: true });
  });

  it('keeps explicit line breaks and never splits an emoji or combining sequence', () => {
    const title = '👨‍👩‍👧‍👦'.repeat(8) + '\ne\u0301'.repeat(2) + '\n';
    const node = createMap(title).nodes.root;
    const width: TextMeasurer = (text) =>
      [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * 20;
    const result = measureNode(node, width);
    expect(result.lines).toEqual(['👨‍👩‍👧‍👦'.repeat(8), 'e\u0301', 'e\u0301', '']);
  });
});
