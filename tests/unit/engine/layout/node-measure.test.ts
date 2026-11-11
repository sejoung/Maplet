import { describe, expect, it } from 'vitest';
import { createMap, updateNode } from '../../../../src/domain/commands';
import { resizeNode } from '../../../../src/domain/style/node-size';
import { measureNode, type TextMeasurer } from '../../../../src/engine/layout/node-measure';

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

  it('excludes hanging separators instead of indenting a soft wrap', () => {
    const node = {
      ...createMap('WWWW  iiii\tWWWW').nodes.root,
      style: { width: 82 },
    };
    const measured = measureNode(node, measuredWidth);
    expect(measured.lines).toEqual(['WWWW  ', 'iiii\tWW', 'WW']);
    expect(measured.lines.join('')).toBe(node.title);
    expect(measured.runs[0][0]).toMatchObject({ text: 'WWWW  ', width: 56, hanging: 2 });
  });

  it('preserves authored indentation and formatting at a wrap boundary', () => {
    const node = {
      ...createMap('WWWW**  iiii**\n  WWWW\n\tend').nodes.root,
      style: { width: 82 },
    };
    const measured = measureNode(node, measuredWidth);
    expect(measured.lines).toEqual(['WWWW  ', 'iiii', '  WWW', 'W', '\tend']);
    expect(measured.runs[0].at(-1)).toMatchObject({ text: '  ', width: 0, hanging: 2 });
    expect(measured.runs[1][0]).toMatchObject({ text: 'iiii', bold: true });
  });

  it('does not widen automatic nodes to accommodate hanging spaces', () => {
    const node = createMap('W'.repeat(15) + '      i').nodes.root;
    const measured = measureNode(node, measuredWidth);
    expect(measured.lines).toEqual(['W'.repeat(15) + '      ', 'i']);
    expect(measured.width).toBe(236);
  });

  it('keeps long trailing whitespace on one line within the automatic width limit', () => {
    const node = createMap('WWWW' + ' '.repeat(100)).nodes.root;
    const measured = measureNode(node, measuredWidth);
    expect(measured.lines).toEqual([node.title]);
    expect(measured.width).toBe(236);
  });
});
