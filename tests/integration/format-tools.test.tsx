// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormatTools } from '../../src/components/FormatTools';
import { InlineNodeEditor } from '../../src/components/InlineNodeEditor';
import { RichEditorBridge, RichEditorContext } from '../../src/components/rich-editor-bridge';
import { readRuns, writeSelection } from '../../src/components/rich-dom';
import { highlightColor, setHighlightColor } from '../../src/components/highlight-color';
import { addNode, createMap, updateNode } from '../../src/domain/commands';
import { formatRuns } from '../../src/domain/rich-text';

const map = updateNode(addNode(createMap('중심'), 'root', 'a', '디자인 검토'), 'a', {
  style: { fontWeight: 'bold' },
});

function setup(editing: boolean) {
  const onFormatNodes = vi.fn();
  const bridge = new RichEditorBridge();
  render(
    <RichEditorContext.Provider value={bridge}>
      <FormatTools map={map} selection={['a']} onFormatNodes={onFormatNodes} />
      {editing && (
        <InlineNodeEditor
          title="디자인 검토"
          lines={1}
          lineHeight={23}
          onDraftChange={vi.fn()}
          onCommit={vi.fn(() => true)}
          onCancel={vi.fn()}
          onAdd={vi.fn()}
        />
      )}
    </RichEditorContext.Provider>,
  );
  const button = (name: string | RegExp) => screen.getByRole('button', { name });
  return { onFormatNodes, button };
}

/** jsdom does not report selection changes, so tell the toolbar as a browser would. */
const select = (input: HTMLElement, start: number, end: number) =>
  act(() => {
    writeSelection(input, { start, end });
    document.dispatchEvent(new Event('selectionchange'));
  });

beforeEach(() => {
  localStorage.clear();
  setHighlightColor('yellow');
});

describe('the toolbar text formatting group', () => {
  it('formats the selected nodes when no title is being edited', () => {
    const { onFormatNodes, button } = setup(false);
    // The node's older whole-node bold shows as bold here too.
    expect(button('굵게')).toHaveAttribute('aria-pressed', 'true');
    expect(button('기울임')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button('굵게'));
    expect(onFormatNodes).toHaveBeenLastCalledWith({ kind: 'bold' });
    fireEvent.click(button('노랑 형광펜으로 칠하기'));
    expect(onFormatNodes).toHaveBeenLastCalledWith({ kind: 'highlight', color: 'yellow' });
  });

  it('formats the selected text of the open editor and keeps it focused', () => {
    const { onFormatNodes, button } = setup(true);
    const input = screen.getByRole('textbox', { name: '노드 제목' });
    const title = () => formatRuns(readRuns(input));
    select(input, 4, 6);
    expect(button('굵게')).toHaveAttribute('aria-pressed', 'false');
    // Pressing a tool does not take focus away from the editor.
    expect(fireEvent.mouseDown(button('굵게'))).toBe(false);
    fireEvent.click(button('굵게'));
    expect(title()).toBe('디자인 **검토**');
    expect(onFormatNodes).not.toHaveBeenCalled();
    select(input, 4, 6);
    expect(button('굵게')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button('기울임'));
    expect(title()).toBe('디자인 ***검토***');
  });

  it('shares one chosen highlighter color between the toolbar and every node', () => {
    const { onFormatNodes, button } = setup(false);
    fireEvent.click(button('형광펜 색 선택'));
    fireEvent.click(button('파랑 형광펜'));
    expect(onFormatNodes).toHaveBeenLastCalledWith({ kind: 'highlight', color: 'blue' });
    expect(highlightColor()).toBe('blue');
    expect(localStorage.getItem('maplet:highlight-color')).toBe('blue');
    expect(screen.queryByRole('button', { name: '파랑 형광펜' })).toBeNull();
    // The main button now uses the chosen color.
    fireEvent.click(button('파랑 형광펜으로 칠하기'));
    expect(onFormatNodes).toHaveBeenLastCalledWith({ kind: 'highlight', color: 'blue' });
    fireEvent.click(button('형광펜 색 선택'));
    expect(button('파랑 형광펜')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button(/서식 지우기/));
    expect(onFormatNodes).toHaveBeenLastCalledWith({ kind: 'clear' });
  });
});
