import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_COLORS,
  formatRange,
  formatRuns,
  plainTitle,
  rangeFormat,
  replaceRange,
  richRuns,
  wordAt,
  type HighlightColor,
} from '../../src/domain/rich-text';
import { addNode, createMap } from '../../src/domain/commands';
import { measureNode, type TextMeasurer } from '../../src/engine/node-measure';
import { layoutMap } from '../../src/engine/layout';
import { renderSvg } from '../../src/engine/svg-export';
import { filenameFromTitle } from '../../src/application/document-name';

const run = (text: string, bold = false, highlight: HighlightColor | null = null) => ({
  text,
  bold,
  highlight,
});

describe('parsing inline formatting', () => {
  it('reads bold, default and colored highlights, and their combinations', () => {
    expect(richRuns('a **b** ==c== =={pink}d **e**== f')).toEqual([
      run('a '),
      run('b', true),
      run(' '),
      run('c', false, 'yellow'),
      run(' '),
      run('d ', false, 'pink'),
      run('e', true, 'pink'),
      run(' f'),
    ]);
    expect(plainTitle('회의 **반드시** ==금요일==')).toBe('회의 반드시 금요일');
  });

  it('keeps unmatched, empty and escaped markers as typed text', () => {
    expect(plainTitle('2 ** 3')).toBe('2 ** 3');
    expect(plainTitle('a == b')).toBe('a == b');
    expect(plainTitle('**** ====')).toBe('**** ====');
    expect(plainTitle('\\*\\*not bold\\*\\*')).toBe('**not bold**');
    expect(plainTitle('path\\to')).toBe('path\\to');
    expect(plainTitle('=={purple}x==')).toBe('{purple}x');
    expect(richRuns('=={purple}x==')).toEqual([run('{purple}x', false, 'yellow')]);
    expect(richRuns('')).toEqual([]);
    expect(plainTitle('plain title')).toBe('plain title');
  });
});

describe('formatting visible text ranges', () => {
  const runs = richRuns('회의 **금요일** 마감');

  it('reports the formatting a range shares, or undefined where it is mixed', () => {
    expect(rangeFormat(runs, 3, 6)).toEqual({ bold: true, highlight: null });
    expect(rangeFormat(runs, 0, 6)).toEqual({ bold: undefined, highlight: null });
    expect(rangeFormat(runs, 2, 2)).toEqual({ bold: undefined, highlight: undefined });
  });

  it('formats a range and writes it back as markers', () => {
    const marked = formatRange(runs, 7, 9, { highlight: 'green' });
    expect(formatRuns(marked)).toBe('회의 **금요일** =={green}마감==');
    expect(formatRuns(formatRange(marked, 0, 9, { bold: false, highlight: null }))).toBe(
      '회의 금요일 마감',
    );
    expect(formatRuns(formatRange(runs, 0, 9, { bold: true }))).toBe('**회의 금요일 마감**');
  });

  it('inserts text with the formatting of the character before it', () => {
    expect(formatRuns(replaceRange(runs, 6, 6, '!'))).toBe('회의 **금요일!** 마감');
    expect(formatRuns(replaceRange(runs, 0, 0, '>'))).toBe('>회의 **금요일** 마감');
    expect(formatRuns(replaceRange(runs, 3, 6, '\n'))).toBe('회의 \n 마감');
  });

  it('finds the word at a caret, including just after it', () => {
    expect(wordAt('alpha 베타 gamma', 7)).toEqual([6, 8]);
    expect(wordAt('alpha 베타 gamma', 14)).toEqual([9, 14]);
    expect(wordAt('a  b', 2)).toBeNull();
  });

  it('escapes literal marker characters so the visible text never changes', () => {
    const raw = 'a**b == c\\';
    const bold = formatRange(richRuns(raw), 0, plainTitle(raw).length, { bold: true });
    expect(plainTitle(formatRuns(bold))).toBe(raw);
    expect(richRuns(formatRuns(bold))).toEqual([run(raw, true)]);
  });

  it('writes any formatting back so it reads as the same runs', () => {
    let seed = 11;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % limit;
    };
    const pieces = ['*', '**', '=', '==', '\\', '{', '{pink}', 'a', '가', ' ', '\n'];
    const colors = [null, ...HIGHLIGHT_COLORS];
    for (let trial = 0; trial < 500; trial++) {
      const runs = Array.from({ length: 1 + random(5) }, () =>
        run(
          Array.from({ length: 1 + random(4) }, () => pieces[random(pieces.length)]).join(''),
          random(2) === 1,
          colors[random(colors.length)],
        ),
      );
      const merged = runs.reduce<typeof runs>((all, next) => {
        const last = all.at(-1);
        if (last && last.bold === next.bold && last.highlight === next.highlight)
          last.text += next.text;
        else all.push({ ...next });
        return all;
      }, []);
      expect(richRuns(formatRuns(runs))).toEqual(merged);
    }
  });
});

describe('measuring and drawing formatted titles', () => {
  const width: TextMeasurer = (text, _node, bold) => [...text].length * (bold ? 12 : 10);

  it('wraps by visible text and measures bold runs in the bold font', () => {
    const node = createMap('ab **cd** ==ef==').nodes.root;
    const measured = measureNode(node, width);
    expect(measured.lines).toEqual(['ab cd ef']);
    expect(measured.runs[0].map((part) => [part.text, part.width])).toEqual([
      ['ab ', 30],
      ['cd', 24],
      [' ', 10],
      ['ef', 20],
    ]);
    expect(measured.width).toBe(84 + 26);
  });

  it('keeps formatting across wrapped and explicit line breaks', () => {
    const node = { ...createMap('**one two**\n==three==').nodes.root, style: { width: 80 } };
    const measured = measureNode(node, width);
    expect(measured.lines).toEqual(['one ', 'two', 'three']);
    expect(measured.runs.map((line) => line.map((part) => part.bold))).toEqual([
      [true],
      [true],
      [false],
    ]);
    expect(measured.runs[2][0].highlight).toBe('yellow');
  });

  it('exports bold runs and highlighter boxes to SVG', () => {
    const map = addNode(createMap('plain **bold** =={blue}note=='), 'root', 'a', 'a **child**');
    const { svg } = renderSvg(map, layoutMap(map));
    // The root is already semibold, so inline bold goes one step heavier there.
    expect(svg).toContain('<tspan font-weight="800">bold</tspan>');
    expect(svg).toContain('<tspan font-weight="700">child</tspan>');
    expect(svg).toContain('fill="#bfdbfe"');
    expect(svg).not.toContain('**');
    expect(svg).not.toContain('{blue}');
  });

  it('names files after the visible title', () => {
    expect(filenameFromTitle('**Plan** ==2027==')).toBe('Plan 2027.maplet');
  });
});
