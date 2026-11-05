import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_COLORS,
  clearFormatting,
  formatRuns,
  cycleHighlight,
  plainTitle,
  richRuns,
  toggleBold,
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
const selectText = (raw: string, text: string) => {
  const start = raw.indexOf(text);
  return [start, start + text.length] as const;
};

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

describe('formatting shortcuts', () => {
  it('toggles bold on the selection and keeps the same text selected', () => {
    const raw = '회의는 금요일까지';
    const bold = toggleBold(raw, ...selectText(raw, '금요일'))!;
    expect(bold.value).toBe('회의는 **금요일**까지');
    expect(bold.value.slice(bold.start, bold.end)).toBe('금요일');
    const plain = toggleBold(bold.value, bold.start, bold.end)!;
    expect(plain.value).toBe(raw);
  });

  it('bolds a partly bold selection first, then removes it', () => {
    const raw = 'a **bc** d';
    const all = toggleBold(raw, 0, raw.length)!;
    expect(all.value).toBe('**a bc d**');
    expect(toggleBold(all.value, all.start, all.end)!.value).toBe('a bc d');
  });

  it('cycles through every highlighter color and back to none', () => {
    let edit = { value: '중요한 일정', start: 0, end: 3 };
    const seen: string[] = [];
    for (let press = 0; press <= HIGHLIGHT_COLORS.length; press++) {
      edit = cycleHighlight(edit.value, edit.start, edit.end)!;
      seen.push(edit.value);
      expect(edit.value.slice(edit.start, edit.end)).toBe('중요한');
    }
    expect(seen).toEqual([
      '==중요한== 일정',
      '=={green}중요한== 일정',
      '=={blue}중요한== 일정',
      '=={pink}중요한== 일정',
      '중요한 일정',
    ]);
  });

  it('applies to the word at the caret when nothing is selected', () => {
    const raw = 'alpha 베타 gamma';
    const caret = raw.indexOf('타');
    expect(toggleBold(raw, caret, caret)!.value).toBe('alpha **베타** gamma');
    expect(cycleHighlight(raw, raw.length, raw.length)!.value).toBe('alpha 베타 ==gamma==');
    expect(toggleBold('a  b', 2, 2)).toBeNull();
  });

  it('treats a selection that includes the markers like the text inside them', () => {
    const raw = 'x **bold** y';
    const edit = cycleHighlight(raw, ...selectText(raw, '**bold**'))!;
    expect(edit.value).toBe('x ==**bold**== y');
    expect(clearFormatting(edit.value, 0, edit.value.length)!.value).toBe('x bold y');
  });

  it('escapes literal marker characters so formatting never changes the visible text', () => {
    const raw = 'a**b == c\\';
    const edit = toggleBold(raw, 0, raw.length)!;
    expect(plainTitle(edit.value)).toBe(raw);
    expect(richRuns(edit.value)).toEqual([run(raw, true)]);
  });

  it('round-trips random titles and formats without changing their text', () => {
    let seed = 7;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % limit;
    };
    const alphabet = ['*', '=', '\\', '{', '}', 'a', '가', ' ', 'yellow', '\n'];
    const actions = [toggleBold, cycleHighlight, clearFormatting];
    for (let trial = 0; trial < 400; trial++) {
      let raw = Array.from({ length: random(14) }, () => alphabet[random(alphabet.length)]).join(
        '',
      );
      const text = plainTitle(raw);
      for (let step = 0; step < 4; step++) {
        const a = random(raw.length + 1);
        const b = random(raw.length + 1);
        const edit = actions[random(actions.length)](raw, Math.min(a, b), Math.max(a, b));
        if (!edit) continue;
        expect(plainTitle(edit.value)).toBe(text);
        raw = edit.value;
      }
    }
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
    // The inline editor shows the markers, so it measures the title as typed.
    expect(measureNode(node, width, true).lines).toEqual(['ab **cd** ==ef==']);
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

  it('measures only the node being edited with its markers', () => {
    const map = addNode(createMap('**Root**'), 'root', 'a', '**Child**');
    const layout = layoutMap(map, width, 'a');
    const lines = Object.fromEntries(layout.nodes.map((node) => [node.id, node.lines]));
    expect(lines).toEqual({ root: ['Root'], a: ['**Child**'] });
  });

  it('exports bold runs and highlighter boxes to SVG', () => {
    const map = createMap('plain **bold** =={blue}note==');
    const { svg } = renderSvg(map, layoutMap(map));
    expect(svg).toContain('<tspan font-weight="700">bold</tspan>');
    expect(svg).toContain('fill="#bfdbfe"');
    expect(svg).not.toContain('**');
    expect(svg).not.toContain('{blue}');
  });

  it('names files after the visible title', () => {
    expect(filenameFromTitle('**Plan** ==2027==')).toBe('Plan 2027.maplet');
  });
});
