// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, type CanvasControls, type CanvasProps } from '../../src/components/Canvas';
import { addNode, createMap } from '../../src/domain/commands';

vi.mock('../../src/components/text-measure', async () => ({
  measureNodeText: (await import('../../src/engine/node-measure')).estimateTextWidth,
  clearTextMeasurements: vi.fn(),
}));

let resize: (width: number, height: number) => void = () => {};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = (width, height) =>
          callback(
            [{ contentRect: { width, height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const controls = createRef<CanvasControls>();
  const props: CanvasProps = {
    map: addNode(createMap('Root'), 'root', 'a', 'A'),
    selected: 'root',
    documentKey: 0,
    editingId: null,
    controlsRef: controls,
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
    onContextMenu: vi.fn(),
    onCopy: vi.fn(() => null),
    onCut: vi.fn(() => null),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
  };
  const view = render(<Canvas {...props} />);
  return { ...view, props, controls };
}

it('fits once the real viewport size arrives, then keeps the user view across resizes', () => {
  const { controls, rerender, props } = setup();
  act(() => resize(1200, 800));
  const fitted = controls.current!.getView();
  const chosen = { x: 37, y: -12, zoom: 1.7 };
  act(() => controls.current!.restoreView(chosen));
  // A window resize or an on-screen keyboard must not discard the chosen pan and zoom.
  act(() => resize(390, 500));
  act(() => resize(1200, 800));
  expect(controls.current!.getView()).toEqual(chosen);
  rerender(<Canvas {...props} documentKey={1} />);
  expect(controls.current!.getView()).toEqual(fitted);
});
