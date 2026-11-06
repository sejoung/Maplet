// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, type CanvasControls, type CanvasProps } from '../../src/components/Canvas';
import { parseMup } from '../../src/adapters/mup/codec';
import { plainTitle } from '../../src/domain/rich-text';
import { branchSpacingSource } from '../support/drag-fixture';

vi.mock('../../src/components/text-measure', async () => ({
  measureNodeText: (await import('../../src/engine/node-measure')).estimateTextWidth,
  clearTextMeasurements: vi.fn(),
}));
// Each node labels itself with its plain title once per render, which tells who rendered.
vi.mock('../../src/domain/rich-text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/domain/rich-text')>();
  return { ...actual, plainTitle: vi.fn(actual.plainTitle) };
});

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const controls = createRef<CanvasControls>();
  const props: CanvasProps = {
    map: parseMup(branchSpacingSource()),
    selected: 'a',
    selection: ['a'],
    documentKey: 0,
    editingId: null,
    controlsRef: controls,
    onToggleSelect: vi.fn(),
    onSelectNodes: vi.fn(),
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onRename: vi.fn(() => true),
    onCancelEdit: vi.fn(),
    onZoomChange: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
    onResize: vi.fn(() => true),
    onReposition: vi.fn(() => true),
    onReparent: vi.fn(() => true),
    onContextMenu: vi.fn(),
    onCanvasMenu: vi.fn(),
    onToggleTask: vi.fn(),
    onFormatNodes: vi.fn(),
    onCopy: vi.fn(() => null),
    onCut: vi.fn(() => null),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
  };
  const view = render(<Canvas {...props} />);
  for (const element of view.container.querySelectorAll<HTMLElement>(
    '.canvas,[data-node-id],[data-resize-handle]',
  )) {
    const captured = new Set<number>();
    Object.assign(element, {
      setPointerCapture: (id: number) => captured.add(id),
      hasPointerCapture: (id: number) => captured.has(id),
      releasePointerCapture: (id: number) => captured.delete(id),
    });
  }
  act(() => controls.current!.restoreView({ x: 0, y: 0, zoom: 1 }));
  const canvas = view.container.querySelector<HTMLElement>('.canvas')!;
  const node = (id: string) => view.container.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  const handle = () => view.container.querySelector<HTMLElement>('[data-resize-handle]')!;
  const at = (dx: number, dy: number) => ({ pointerId: 1, clientX: 300 + dx, clientY: 100 + dy });
  return { props, canvas, node, handle, at };
}

const rendered = () => [...new Set(vi.mocked(plainTitle).mock.calls.map(([title]) => title))];

it('re-renders only the dragged branch on each drag frame', () => {
  const { canvas, node, at } = setup();
  fireEvent.pointerDown(node('a'), { ...at(0, 0), button: 0 });
  vi.mocked(plainTitle).mockClear();
  fireEvent.pointerMove(canvas, at(0, -40));
  expect(rendered().sort()).toEqual(['a', 'child']);
  vi.mocked(plainTitle).mockClear();
  fireEvent.pointerMove(canvas, at(0, -80));
  expect(rendered().sort()).toEqual(['a', 'child']);
  expect(node('b').style.top).toBe('240px');
});

it('resizes through the canvas gesture and lets Escape abandon it', () => {
  const { props, canvas, handle, node } = setup();
  const width = parseFloat(node('a').style.width);
  fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  expect(document.activeElement).toBe(handle());
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 100 });
  expect(parseFloat(node('a').style.width)).toBe(width + 40);
  // The pan a wheel would start waits for the resize.
  fireEvent.wheel(canvas, { deltaX: 50 });
  expect(node('a').style.left).toBe('280px');
  fireEvent.pointerUp(canvas, { pointerId: 1 });
  expect(props.onResize).toHaveBeenCalledExactlyOnceWith('a', width + 40, expect.any(Object));

  fireEvent.pointerDown(handle(), { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 160, clientY: 100 });
  fireEvent.keyDown(handle(), { key: 'Escape' });
  expect(parseFloat(node('a').style.width)).toBe(width);
  fireEvent.pointerUp(canvas, { pointerId: 2 });
  expect(props.onResize).toHaveBeenCalledOnce();
});

it('keeps plain node keys in the canvas and passes modified ones on to app shortcuts', () => {
  const { props, canvas, node } = setup();
  const shortcuts = vi.fn();
  window.addEventListener('keydown', shortcuts);
  fireEvent.keyDown(node('a'), { key: 'Delete' });
  expect(props.onDelete).toHaveBeenCalledOnce();
  expect(shortcuts).not.toHaveBeenCalled();
  fireEvent.keyDown(node('a'), { key: 'z', ctrlKey: true });
  fireEvent.keyDown(canvas, { key: '?' });
  expect(shortcuts).toHaveBeenCalledTimes(2);
  window.removeEventListener('keydown', shortcuts);
});
