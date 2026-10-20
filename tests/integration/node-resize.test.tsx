// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent, KeyboardEvent } from 'react';
import { expect, it, vi } from 'vitest';
import { useNodeResize } from '../../src/components/useNodeResize';
import { addNode, createMap } from '../../src/domain/commands';
import { resizeNode } from '../../src/domain/node-size';
import { layoutMap } from '../../src/engine/layout';

vi.mock('../../src/components/text-measure', async () => ({
  measureNodeText: (await import('../../src/engine/node-measure')).estimateTextWidth,
  clearTextMeasurements: vi.fn(),
}));

type Input = PointerEvent<HTMLButtonElement> & KeyboardEvent<HTMLButtonElement>;
function setup(zoom = 1) {
  const title = '긴 제목과 English 👨‍👩‍👧‍👦도 줄바꿈 후 모두 보존합니다. '.repeat(3);
  const map = resizeNode(addNode(createMap(title), 'root', 'child', 'Child'), 'root', 100);
  const base = layoutMap(map);
  const onResize = vi.fn(() => true);
  const view = renderHook(({ map, base, zoom }) => useNodeResize(map, base, zoom, onResize), {
    initialProps: { map, base, zoom },
  });
  const target = Object.assign(document.createElement('button'), {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  const event = (fields: Partial<Input> = {}) =>
    ({
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      shiftKey: false,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      currentTarget: target,
      ...fields,
    }) as Input;
  const invoke = (
    name:
      | 'onPointerDown'
      | 'onPointerMove'
      | 'onPointerUp'
      | 'onPointerCancel'
      | 'onLostPointerCapture'
      | 'onKeyDown'
      | 'onDoubleClick',
    fields: Partial<Input> = {},
  ) => act(() => view.result.current.handlers('root')[name]!(event(fields)));
  const positions = Object.fromEntries(base.nodes.map(({ id, x, y }) => [id, { x, y }]));
  return { ...view, map, base, zoom, title, positions, onResize, target, invoke };
}

it.each([
  { zoom: 0.5, dx: 40, width: 180 },
  { zoom: 1, dx: 40, width: 140 },
  { zoom: 2, dx: 40, width: 120 },
  { zoom: 1.25, dx: 40, width: 132 },
  { zoom: 1, dx: -1000, width: 56 },
  { zoom: 1, dx: 10000, width: 1200 },
])(
  'previews and commits width $width at zoom $zoom with anchored positions',
  ({ zoom, dx, width }) => {
    const view = setup(zoom);
    view.invoke('onPointerDown');
    view.invoke('onPointerMove', { clientX: 100 + dx, clientY: -900 });
    expect(view.onResize).not.toHaveBeenCalled();
    const preview = view.result.current.layout;
    const root = preview.nodes.find((node) => node.id === 'root')!;
    expect(root.width).toBe(width);
    expect(root.lines.join('')).toBe(view.title);
    expect(root.height).toBeGreaterThanOrEqual(root.lines.length * 23 + 14);
    for (const node of preview.nodes)
      expect({ x: node.x, y: node.y }).toEqual(view.positions[node.id]);
    expect(preview.edges[0].path).not.toBe(view.base.edges[0].path);
    view.invoke('onPointerUp');
    view.invoke('onPointerUp');
    expect(view.onResize).toHaveBeenCalledExactlyOnceWith('root', width, view.positions);
    expect(view.target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  },
);

it.each(['Escape', 'pointercancel', 'lostpointercapture'] as const)(
  'discards the preview on %s',
  (action) => {
    const view = setup();
    view.invoke('onPointerDown');
    view.invoke('onPointerMove', { clientX: 180 });
    expect(view.result.current.layout).not.toEqual(view.base);
    if (action === 'Escape') view.invoke('onKeyDown', { key: 'Escape' });
    else view.invoke(action === 'pointercancel' ? 'onPointerCancel' : 'onLostPointerCapture');
    expect(view.result.current.layout).toEqual(view.base);
    view.invoke('onPointerUp');
    expect(view.onResize).not.toHaveBeenCalled();
  },
);

it('ignores secondary buttons, foreign pointers and movement below the drag threshold', () => {
  const view = setup();
  view.invoke('onPointerDown', { button: 2 });
  expect(view.result.current.active).toBe(false);
  view.invoke('onPointerDown');
  view.invoke('onPointerMove', { pointerId: 2, clientX: 200 });
  view.invoke('onPointerUp', { pointerId: 2 });
  expect(view.result.current.active).toBe(true);
  view.invoke('onPointerMove', { clientX: 102, clientY: 101 });
  view.invoke('onPointerUp');
  expect(view.onResize).not.toHaveBeenCalled();
});

it.each(['vertical only', 'return to origin'])(
  'does not commit a width change after %s movement',
  (mode) => {
    const view = setup();
    view.invoke('onPointerDown');
    view.invoke('onPointerMove', { clientX: mode === 'vertical only' ? 100 : 140, clientY: 140 });
    if (mode === 'return to origin') view.invoke('onPointerMove');
    view.invoke('onPointerUp');
    expect(view.onResize).not.toHaveBeenCalled();
  },
);

it('discards a stale resize after the document changes', () => {
  const view = setup();
  view.invoke('onPointerDown');
  view.invoke('onPointerMove', { clientX: 180 });
  const map = createMap('Replacement'),
    base = layoutMap(map);
  view.rerender({ map, base, zoom: 1 });
  view.invoke('onPointerUp');
  expect(view.result.current.layout).toEqual(base);
  expect(view.onResize).not.toHaveBeenCalled();
});

it.each([
  { key: 'ArrowRight', shiftKey: false, width: 110 },
  { key: 'ArrowRight', shiftKey: true, width: 125 },
  { key: 'ArrowLeft', shiftKey: false, width: 90 },
  { key: 'ArrowLeft', shiftKey: true, width: 75 },
  { key: 'Home', shiftKey: false, width: null },
])('handles $key with shift=$shiftKey as one anchored edit', ({ key, shiftKey, width }) => {
  const view = setup();
  view.invoke('onKeyDown', { key, shiftKey });
  expect(view.onResize).toHaveBeenCalledExactlyOnceWith(
    'root',
    width,
    width === null ? {} : view.positions,
  );
});

it('restores automatic width on double click', () => {
  const view = setup();
  view.invoke('onDoubleClick');
  expect(view.onResize).toHaveBeenCalledExactlyOnceWith('root', null, {});
});
