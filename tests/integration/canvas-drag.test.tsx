// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, type CanvasControls, type CanvasProps } from '../../src/components/Canvas';
import { createMap, updateNode } from '../../src/domain/commands';
import { parseMup } from '../../src/adapters/mup/codec';
import { parseMaplet, serializeMaplet } from '../../src/adapters/maplet/codec';
import { setNodePositions } from '../../src/domain/positions';
import { branchSpacingSource } from '../support/drag-fixture';

vi.mock('../../src/components/text-measure', async () => ({
  measureNodeText: (await import('../../src/engine/node-measure')).estimateTextWidth,
  clearTextMeasurements: vi.fn(),
}));

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

function setup(map = parseMup(branchSpacingSource())) {
  const controls = createRef<CanvasControls>();
  const props: CanvasProps = {
    map,
    selected: 'a',
    selection: ['a'],
    onToggleSelect: vi.fn(),
    onSelectNodes: vi.fn(),
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
    onReparent: vi.fn(() => true),
    onContextMenu: vi.fn(),
    onCanvasMenu: vi.fn(),
    onCopy: vi.fn(() => null),
    onCut: vi.fn(() => null),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
  };
  const view = render(<Canvas {...props} />);
  // jsdom supplies event plumbing; deterministic font metrics and pointer capture are doubles.
  for (const element of view.container.querySelectorAll<HTMLElement>('.canvas,[data-node-id]')) {
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
  const positions = () =>
    Object.fromEntries(
      [...view.container.querySelectorAll<HTMLElement>('[data-node-id]')].map((element) => [
        element.dataset.nodeId!,
        { x: parseFloat(element.style.left), y: parseFloat(element.style.top) },
      ]),
    );
  const start = (id = 'a') =>
    fireEvent.pointerDown(node(id), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
  // Alt places freely and pushes other branches aside live; without it they hold still.
  const move = (dx: number, dy: number, pointerId = 1, altKey = true) =>
    fireEvent.pointerMove(canvas, {
      pointerId,
      clientX: 300 + dx,
      clientY: 100 + dy,
      altKey,
    });
  const finish = () => fireEvent.pointerUp(canvas, { pointerId: 1 });
  return { ...view, props, controls, node, canvas, positions, start, move, finish };
}

it('restores obstructing branches when moving away and commits only the last preview once', () => {
  const view = setup(),
    before = view.positions();
  view.start();
  view.move(0, 160);
  const first = view.positions();
  expect(first.b).not.toEqual(before.b);
  expect(view.props.onReposition).not.toHaveBeenCalled();
  view.move(0, 10);
  expect(view.positions().b).toEqual(before.b);
  expect(view.positions().bChild).toEqual(before.bChild);
  expect(view.container.querySelector('.branch-region.displaced')).toBeNull();
  view.move(0, 160);
  expect(view.positions()).toEqual(first);
  view.move(10, 164);
  const last = view.positions();
  expect(last.a).not.toEqual(first.a);
  view.finish();
  expect(view.props.onReposition).toHaveBeenCalledExactlyOnceWith(last);
});

it('does not commit a clear drag that returns to the origin', () => {
  const view = setup(),
    before = view.positions();
  view.start();
  view.move(0, 160);
  view.move(0, 0);
  view.finish();
  expect(view.positions()).toEqual(before);
  expect(view.props.onReposition).not.toHaveBeenCalled();
});

it('renders complete group guides when a child enters empty branch space', () => {
  const view = setup(parseMup(branchSpacingSource(true)));
  const before = view.positions();
  view.start();
  view.move(0, 180);
  const preview = view.positions();
  expect(preview.b).not.toEqual(before.b);
  expect(view.container.querySelectorAll('.branch-region')).toHaveLength(2);
  for (const [id, ids] of [
    ['a', ['a', 'child']],
    ['b', ['b', 'bChild']],
  ] as const) {
    const region = view.container.querySelector<HTMLElement>(`[data-branch-region="${id}"]`)!;
    const nodes = ids.map((key) => view.node(key));
    const left = Math.min(...nodes.map((node) => parseFloat(node.style.left))) - 12;
    const top = Math.min(...nodes.map((node) => parseFloat(node.style.top))) - 12;
    const right =
      Math.max(...nodes.map((node) => parseFloat(node.style.left) + parseFloat(node.style.width))) +
      12;
    const bottom =
      Math.max(
        ...nodes.map((node) => parseFloat(node.style.top) + parseFloat(node.style.minHeight)),
      ) + 12;
    expect(JSON.parse(region.dataset.regionNodes!)).toEqual(ids);
    expect(region).toHaveStyle({
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });
  }
  view.finish();
  expect(view.props.onReposition).toHaveBeenCalledExactlyOnceWith(preview);
});

it('commits a visible correction to an existing intrusion even when the dragged node returns to its origin', () => {
  const view = setup(parseMup(branchSpacingSource(true, true))),
    before = view.positions();
  view.start();
  view.move(0, 20);
  view.move(0, 0);
  const preview = view.positions();
  expect(preview.a).toEqual(before.a);
  expect(preview.b).not.toEqual(before.b);
  view.finish();
  expect(view.props.onReposition).toHaveBeenCalledExactlyOnceWith(preview);
});

it.each([0.5, 1, 2])(
  'converts pointer deltas at zoom %s and ignores another pointer and sub-threshold movement',
  (zoom) => {
    const view = setup(),
      before = view.positions();
    act(() => view.controls.current!.restoreView({ x: 0, y: 0, zoom }));
    view.start();
    view.move(100, 50, 2);
    expect(view.positions()).toEqual(before);
    view.move(2, 1);
    expect(view.positions()).toEqual(before);
    view.move(-40, -30);
    const preview = view.positions();
    for (const id of ['a', 'child'])
      expect(preview[id]).toEqual({ x: before[id].x - 40 / zoom, y: before[id].y - 30 / zoom });
    view.finish();
    expect(view.props.onReposition).toHaveBeenCalledExactlyOnceWith(preview);
  },
);

it('moves a root with its descendants and preserves the positions through a native round trip', () => {
  const view = setup(),
    before = view.positions();
  view.start('root');
  view.move(35, 65);
  const preview = view.positions();
  for (const id of Object.keys(before))
    expect(preview[id]).toEqual({ x: before[id].x + 35, y: before[id].y + 65 });
  view.finish();
  expect(view.props.onReposition).toHaveBeenCalledExactlyOnceWith(preview);
  const reopened = parseMaplet(serializeMaplet(setNodePositions(view.props.map, preview)));
  for (const id of Object.keys(before)) expect(reopened.nodes[id].position).toEqual(preview[id]);
});

it('keeps moved hidden descendants when a saved collapsed branch is reopened', () => {
  const map = updateNode(parseMup(branchSpacingSource()), 'a', { collapsed: true });
  const view = setup(map);
  view.start();
  view.move(-35, 45);
  view.finish();
  const positions = vi.mocked(view.props.onReposition).mock.calls[0][0];
  const reopened = parseMaplet(serializeMaplet(setNodePositions(map, positions)));
  expect(reopened.nodes.a.collapsed).toBe(true);
  expect(reopened.nodes.child.position).toEqual({
    x: map.nodes.child.position!.x - 35,
    y: map.nodes.child.position!.y + 45,
  });
  view.rerender(<Canvas {...view.props} map={updateNode(reopened, 'a', { collapsed: false })} />);
  expect(view.positions().child).toEqual(reopened.nodes.child.position);
});

it('abandons the preview when the document changes before release', () => {
  const view = setup();
  view.start();
  view.move(0, 160);
  view.rerender(<Canvas {...view.props} map={createMap('Replacement')} documentKey={1} />);
  view.finish();
  expect(view.props.onReposition).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll('[data-node-id]')).toHaveLength(1);
});

it('holds other branches still without Alt and commits the guided arrangement on release', () => {
  const view = setup(),
    before = view.positions();
  view.start();
  view.move(0, 160, 1, false);
  const held = view.positions();
  expect(held.b).toEqual(before.b);
  expect(held.a).toEqual({ x: before.a.x, y: before.a.y + 160 });
  const guide = view.container.querySelector<HTMLElement>('.branch-region.displaced')!;
  expect(JSON.parse(guide.dataset.regionNodes!)).toEqual(['b', 'bChild']);
  view.finish();
  const committed = vi.mocked(view.props.onReposition).mock.calls[0][0];
  expect(committed.a).toEqual(held.a);
  expect(committed.b).not.toEqual(before.b);
  expect(committed.b.y - 12).toBeCloseTo(parseFloat(guide.style.top), 5);
});
