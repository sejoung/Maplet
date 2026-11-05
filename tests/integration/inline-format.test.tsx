// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InlineNodeEditor } from '../../src/components/InlineNodeEditor';
import { RichLine } from '../../src/components/RichLine';
import { readRuns, readSelection, renderRuns, writeSelection } from '../../src/components/rich-dom';
import { EditHistory, runCommand } from '../../src/components/rich-editing';
import { measureNode } from '../../src/engine/node-measure';
import { createMap } from '../../src/domain/commands';
import { formatRuns, richRuns } from '../../src/domain/rich-text';

function editor(title: string) {
  const onCommit = vi.fn(() => true);
  const onDraftChange = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineNodeEditor
      title={title}
      lines={1}
      lineHeight={23}
      onDraftChange={onDraftChange}
      onCommit={onCommit}
      onCancel={onCancel}
      onAdd={vi.fn()}
    />,
  );
  const input = screen.getByRole('textbox', { name: '노드 제목' });
  const select = (text: string) => {
    const start = input.textContent!.indexOf(text);
    writeSelection(input, { start, end: start + text.length });
  };
  const title_ = () => formatRuns(readRuns(input));
  return { input, select, title: title_, onCommit, onDraftChange, onCancel };
}

describe('the formatted title editor', () => {
  it('shows formatting instead of markers and selects the whole title', () => {
    const { input } = editor('회의 **금요일** =={pink}마감==');
    expect(input.textContent).toBe('회의 금요일 마감');
    expect(input.querySelector('strong.rich-bold')?.textContent).toBe('금요일');
    expect(input.querySelector('mark')?.dataset.highlight).toBe('pink');
    expect(readSelection(input)).toEqual({ start: 0, end: 9 });
    expect(document.activeElement).toBe(input);
  });

  it('formats the selection with shortcuts and commits the marked-up title', () => {
    const { input, select, title, onCommit, onDraftChange } = editor('회의 금요일 마감');
    select('금요일');
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(title()).toBe('회의 **금요일** 마감');
    expect(readSelection(input)).toEqual({ start: 3, end: 6 });
    expect(onDraftChange).toHaveBeenLastCalledWith('회의 **금요일** 마감');
    select('마감');
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', metaKey: true, shiftKey: true });
    expect(title()).toBe('회의 **금요일** ==마감==');
    // Pressing it again on the same color takes the highlight off.
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', metaKey: true, shiftKey: true });
    expect(title()).toBe('회의 **금요일** 마감');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('회의 **금요일** 마감', true);
  });

  it('picks highlighter colors and bold from the right-click menu', () => {
    const { input, select, title } = editor('예산 확정 금요일');
    select('예산 확정');
    fireEvent.contextMenu(input, { clientX: 40, clientY: 50 });
    const menu = screen.getByRole('menu', { name: '글자 서식' });
    expect(screen.getByRole('menuitemcheckbox', { name: /굵게/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: '초록 형광펜' }));
    expect(menu).not.toBeInTheDocument();
    expect(title()).toBe('=={green}예산 확정== 금요일');
    expect(document.activeElement).toBe(input);

    fireEvent.contextMenu(input, { clientX: 40, clientY: 50 });
    expect(screen.getByRole('menuitemradio', { name: '초록 형광펜' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /굵게/ }));
    expect(title()).toBe('=={green}**예산 확정**== 금요일');
    // The shortcut now uses the color last picked from the menu.
    select('금요일');
    fireEvent.keyDown(input, { key: 'H', code: 'KeyH', ctrlKey: true, shiftKey: true });
    expect(title()).toBe('=={green}**예산 확정**== =={green}금요일==');
    fireEvent.contextMenu(input, { clientX: 40, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: /서식 지우기/ }));
    expect(title()).toBe('=={green}**예산 확정**== 금요일');
    expect(readSelection(input)).toEqual({ start: 6, end: 9 });
  });

  it('keeps the browser menu without a selection and closes its own with Escape', () => {
    const { input, select, onCancel } = editor('메뉴');
    writeSelection(input, { start: 1, end: 1 });
    expect(fireEvent.contextMenu(input)).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    select('메뉴');
    fireEvent.keyDown(input, { key: 'F10', shiftKey: true });
    const first = screen.getByRole('menuitemcheckbox', { name: /굵게/ });
    expect(document.activeElement).toBe(first);
    // Moving focus into the menu does not end editing.
    fireEvent.blur(input, { relatedTarget: first });
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(readSelection(input)).toEqual({ start: 0, end: 2 });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledWith(true);
  });

  it('undoes and redoes formatting inside the editing session', () => {
    const { input, select, title } = editor('하나 둘');
    select('둘');
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', metaKey: true });
    fireEvent.keyDown(input, { key: '\\', code: 'Backslash', metaKey: true });
    expect(title()).toBe('하나 둘');
    fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', metaKey: true });
    expect(title()).toBe('하나 **둘**');
    fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', metaKey: true });
    expect(title()).toBe('하나 둘');
    fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true });
    expect(title()).toBe('하나 **둘**');
  });

  it('pastes plain text and inserts line breaks with Shift+Enter', () => {
    const { input, title, onDraftChange } = editor('**굵게**');
    writeSelection(input, { start: 2, end: 2 });
    fireEvent.paste(input, { clipboardData: { getData: () => ' 글자\r\n둘' } });
    expect(title()).toBe('**굵게 글자\n둘**');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(title()).toBe('**굵게 글자\n둘\n**');
    // The empty last line keeps a placeholder so the caret can sit on it.
    expect(input.lastChild).toHaveProperty('tagName', 'BR');
    expect(readSelection(input)).toEqual({ start: 8, end: 8 });
    expect(onDraftChange).toHaveBeenLastCalledWith('**굵게 글자\n둘\n**');
  });

  it('waits for an IME composition to finish before formatting', () => {
    vi.useFakeTimers();
    try {
      const { input, title } = editor('가나');
      fireEvent.compositionStart(input);
      fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true, isComposing: true });
      expect(title()).toBe('가나');
      fireEvent.compositionEnd(input);
      act(() => vi.runAllTimers());
      expect(title()).toBe('**가나**');
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the physical key on a Korean layout and lets other shortcuts through', () => {
    const { input, title } = editor('굵은 글자');
    fireEvent.keyDown(input, { key: 'ㅠ', code: 'KeyB', metaKey: true });
    expect(title()).toBe('**굵은 글자**');
    fireEvent.keyDown(input, { key: 'ㅑ', code: 'KeyI', ctrlKey: true });
    expect(title()).toBe('***굵은 글자***');
    expect(fireEvent.keyDown(input, { key: 'u', code: 'KeyU', ctrlKey: true })).toBe(true);
  });

  it('commits or restores on blur depending on whether text is left', () => {
    const first = editor('제목');
    fireEvent.blur(first.input);
    expect(first.onCommit).toHaveBeenCalledWith('제목', false);
  });
});

describe('editor DOM helpers', () => {
  it('reads browser line breaks and blocks, ignoring a trailing filler break', () => {
    const element = document.createElement('div');
    element.innerHTML = 'a<br>b<div>c</div><mark data-highlight="blue">d</mark><br>';
    expect(formatRuns(readRuns(element))).toBe('a\nb\nc=={blue}d==');
    element.innerHTML = '<span style="font-weight:bold">x</span><b>y</b>';
    expect(formatRuns(readRuns(element))).toBe('x**y**');
  });

  it('maps selections across formatted elements in both directions', () => {
    const element = document.createElement('div');
    document.body.append(element);
    renderRuns(element, richRuns('ab **cd** ==ef==\n'));
    for (const selection of [
      { start: 0, end: 0 },
      { start: 1, end: 4 },
      { start: 3, end: 7 },
      { start: 9, end: 9 },
    ]) {
      writeSelection(element, selection);
      expect(readSelection(element)).toEqual(selection);
    }
    element.remove();
  });

  it('applies commands to the word at the caret and groups typing in history', () => {
    const runs = richRuns('alpha 베타');
    expect(
      formatRuns(runCommand({ runs, selection: { start: 7, end: 7 } }, { kind: 'bold' })!.runs),
    ).toBe('alpha **베타**');
    expect(
      runCommand({ runs: richRuns('a  b'), selection: { start: 2, end: 2 } }, { kind: 'bold' }),
    ).toBeNull();
    const history = new EditHistory();
    const state = (text: string) => ({ runs: richRuns(text), selection: { start: 0, end: 0 } });
    history.record(state('a'), 'insertText', 0);
    history.record(state('ab'), 'insertText', 200);
    history.record(state('abc'), 'insertText', 2000);
    expect(history.undo(state('abcd'))?.runs).toEqual(richRuns('abc'));
    expect(history.undo(state('abc'))?.runs).toEqual(richRuns('a'));
    expect(history.undo(state('a'))).toBeNull();
    expect(history.redo(state('a'))?.runs).toEqual(richRuns('abc'));
  });
});

it('renders bold and colored highlighter runs in the node display', () => {
  const node = createMap('a **b** =={pink}c==').nodes.root;
  const { container } = render(<RichLine runs={measureNode(node).runs[0]} />);
  expect(container.querySelector('strong.rich-bold')?.textContent).toBe('b');
  const mark = container.querySelector('mark.rich-mark') as HTMLElement;
  expect(mark.dataset.highlight).toBe('pink');
  expect(container.textContent).toBe('a b c');
});
