// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { expect, it, vi } from 'vitest';
import { useNodeResize } from '../../src/components/useNodeResize';
import { addNode, createMap } from '../../src/domain/commands';
import { resizeNode } from '../../src/domain/node-size';
import { layoutMap } from '../../src/engine/layout';

vi.mock('../../src/components/text-measure', async () => ({
  measureNodeText: (await import('../../src/engine/node-measure')).estimateTextWidth,
  clearTextMeasurements: vi.fn(),
}));

type Input = KeyboardEvent<HTMLButtonElement> & MouseEvent<HTMLButtonElement>;
function setup(zoom = 1) {
  const title = '긴 제목과 English 👨‍👩‍👧‍👦도 줄바꿈 후 모두 보존합니다. '.repeat(3);
  const map = resizeNode(addNode(createMap(title), 'root', 'child', 'Child'), 'root', 100);
  const base = layoutMap(map);
  const onResize = vi.fn(() => true);
  const view = renderHook(({ map, base }) => useNodeResize(map, base, onResize), {
    initialProps: { map, base },
  });
  // The canvas drives the drag with screen points; the handle keeps its own keys.
  const gesture = () => view.result.current.gesture;
  const start = () => act(() => gesture().start('root', { x: 100, y: 100 }, zoom));
  const move = (x: number, y = 100) => act(() => gesture().move({ x, y }));
  const finish = () => act(() => gesture().finish());
  const invoke = (name: 'onKeyDown' | 'onDoubleClick', fields: Partial<Input> = {}) =>
    act(() =>
      view.result.current.handleProps('root')[name]!({
        shiftKey: false,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        ...fields,
      } as Input),
    );
  const positions = Object.fromEntries(base.nodes.map(({ id, x, y }) => [id, { x, y }]));
  return { ...view, map, base, title, positions, onResize, start, move, finish, gesture, invoke };
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
    view.start();
    view.move(100 + dx, -900);
    expect(view.onResize).not.toHaveBeenCalled();
    const preview = view.result.current.layout;
    const root = preview.nodes.find((node) => node.id === 'root')!;
    expect(root.width).toBe(width);
    expect(root.lines.join('')).toBe(view.title);
    expect(root.height).toBeGreaterThanOrEqual(root.lines.length * 23 + 14);
    for (const node of preview.nodes)
      expect({ x: node.x, y: node.y }).toEqual(view.positions[node.id]);
    expect(preview.edges[0].path).not.toBe(view.base.edges[0].path);
    view.finish();
    view.finish();
    expect(view.onResize).toHaveBeenCalledExactlyOnceWith('root', width, view.positions);
  },
);

it('discards the preview when cancelled', () => {
  const view = setup();
  view.start();
  view.move(180);
  expect(view.result.current.layout).not.toEqual(view.base);
  act(() => view.gesture().cancel());
  expect(view.result.current.layout).toEqual(view.base);
  view.finish();
  expect(view.onResize).not.toHaveBeenCalled();
});

it('ignores a second start and movement below the drag threshold', () => {
  const view = setup();
  view.start();
  act(() => view.gesture().start('child', { x: 300, y: 300 }, 1));
  view.move(102, 101);
  view.finish();
  expect(view.onResize).not.toHaveBeenCalled();
});

it.each(['vertical only', 'return to origin'])(
  'does not commit a width change after %s movement',
  (mode) => {
    const view = setup();
    view.start();
    view.move(mode === 'vertical only' ? 100 : 140, 140);
    if (mode === 'return to origin') view.move(100);
    view.finish();
    expect(view.onResize).not.toHaveBeenCalled();
  },
);

it('discards a stale resize after the document changes', () => {
  const view = setup();
  view.start();
  view.move(180);
  const map = createMap('Replacement'),
    base = layoutMap(map);
  view.rerender({ map, base });
  view.finish();
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
