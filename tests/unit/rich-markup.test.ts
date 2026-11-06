// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { richWrappers } from '../../src/components/rich-markup';
import { richElement } from '../../src/components/rich-dom';
import { RichLine } from '../../src/components/RichLine';
import { swatchProps } from '../../src/components/format-commands';
import { HIGHLIGHT_FILLS, HIGHLIGHT_TEXT } from '../../src/engine/render-metrics';
import type { TextRun } from '../../src/domain/rich-text';

const run = (fields: Partial<TextRun>): TextRun => ({
  text: 'x',
  bold: false,
  italic: false,
  highlight: null,
  ...fields,
});

describe('rich markup', () => {
  it('wraps formatted text innermost first: mark > strong > em', () => {
    expect(richWrappers(run({})).map((wrapper) => wrapper.tag)).toEqual([]);
    const all = richWrappers(run({ bold: true, italic: true, highlight: 'blue' }));
    expect(all.map((wrapper) => wrapper.tag)).toEqual(['em', 'strong', 'mark']);
    expect(all[2]).toMatchObject({
      highlight: 'blue',
      style: { background: HIGHLIGHT_FILLS.blue, color: HIGHLIGHT_TEXT },
    });
  });

  it('builds the same markup in the editor and in the node display', () => {
    const formatted = run({ text: 'hi', bold: true, italic: true, highlight: 'pink' });
    const editor = document.createElement('div');
    editor.append(richElement(formatted));
    const display = render(
      createElement(RichLine, { runs: [{ ...formatted, width: 10 }] }),
    ).container.querySelector('span')!;
    expect(display.innerHTML).toBe(editor.innerHTML);
    const mark = editor.querySelector<HTMLElement>('mark.rich-mark[data-highlight="pink"]')!;
    expect(mark.querySelector(':scope > strong.rich-bold > em.rich-italic')?.textContent).toBe(
      'hi',
    );
    expect(mark.style.color).not.toBe('');
  });

  it('names highlighter swatches', () => {
    expect(swatchProps('green', (key) => `t:${key}`)).toEqual({
      className: 'format-swatch',
      'aria-label': 't:format.green',
      title: 't:format.green',
      style: { background: HIGHLIGHT_FILLS.green },
    });
  });
});
