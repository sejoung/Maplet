// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineNodeEditor } from '../../src/components/InlineNodeEditor';
import { RichLine } from '../../src/components/RichLine';
import { measureNode } from '../../src/engine/node-measure';
import { createMap } from '../../src/domain/commands';

function editor(title: string) {
  const onCommit = vi.fn(() => true);
  const onDraftChange = vi.fn();
  render(
    <InlineNodeEditor
      title={title}
      lines={1}
      lineHeight={23}
      onDraftChange={onDraftChange}
      onCommit={onCommit}
      onCancel={vi.fn()}
      onAdd={vi.fn()}
    />,
  );
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  const select = (text: string) => {
    const start = input.value.indexOf(text);
    input.setSelectionRange(start, start + text.length);
  };
  return { input, select, onCommit, onDraftChange };
}

describe('inline formatting shortcuts in the title editor', () => {
  it('bolds and highlights the selection, then commits the marked-up title', () => {
    const { input, select, onCommit, onDraftChange } = editor('회의 금요일 마감');
    select('금요일');
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(input.value).toBe('회의 **금요일** 마감');
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('금요일');
    expect(onDraftChange).toHaveBeenLastCalledWith('회의 **금요일** 마감');
    select('마감');
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', metaKey: true, shiftKey: true });
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', metaKey: true, shiftKey: true });
    expect(input.value).toBe('회의 **금요일** =={green}마감==');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('회의 **금요일** =={green}마감==', true);
  });

  it('follows the physical key on a Korean keyboard layout and clears formatting', () => {
    const { input, select } = editor('**굵은** 글자');
    select('**굵은**');
    fireEvent.keyDown(input, { key: 'ㅠ', code: 'KeyB', metaKey: true });
    expect(input.value).toBe('굵은 글자');
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', ctrlKey: true, shiftKey: true });
    select('==굵은==');
    fireEvent.keyDown(input, { key: '\\', code: 'Backslash', ctrlKey: true });
    expect(input.value).toBe('굵은 글자');
  });

  it('waits for an IME composition to finish before formatting', () => {
    vi.useFakeTimers();
    try {
      const { input } = editor('가나');
      input.setSelectionRange(0, 2);
      fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true, isComposing: true });
      expect(input.value).toBe('가나');
      fireEvent.compositionEnd(input);
      vi.runAllTimers();
      expect(input.value).toBe('**가나**');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves other modifier shortcuts to the browser and the app', () => {
    const { input } = editor('title');
    input.setSelectionRange(0, 5);
    const event = fireEvent.keyDown(input, { key: 'i', code: 'KeyI', ctrlKey: true });
    expect(event).toBe(true);
    expect(input.value).toBe('title');
  });

  it('renders bold and colored highlighter runs', () => {
    const node = createMap('a **b** =={pink}c==').nodes.root;
    const { container } = render(<RichLine runs={measureNode(node).runs[0]} />);
    expect(container.querySelector('strong.rich-bold')?.textContent).toBe('b');
    const mark = container.querySelector('mark.rich-mark') as HTMLElement;
    expect(mark.dataset.highlight).toBe('pink');
    expect(mark.textContent).toBe('c');
    expect(container.textContent).toBe('a b c');
  });
});
