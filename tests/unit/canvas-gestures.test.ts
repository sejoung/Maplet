import { describe, expect, it } from 'vitest';
import {
  classifyPress,
  isBusy,
  marqueeRect,
  panView,
  pinchView,
  startPan,
  startPinch,
  travelled,
  type Press,
} from '../../src/components/canvas-gestures';
import { DRAG_THRESHOLD } from '../../src/engine/branch-drag';

const press = (fields: Partial<Press> = {}): Press => ({
  button: 0,
  additive: false,
  handle: false,
  control: false,
  down: 0,
  ...fields,
});
const idle = { current: 'idle' as const, panMode: false, editingId: null };

describe('classifyPress', () => {
  it('drags nodes, pans empty canvas and box-selects with a modifier', () => {
    expect(classifyPress(press({ nodeId: 'a' }), idle)).toBe('nodeDrag');
    expect(classifyPress(press(), idle)).toBe('pan');
    expect(classifyPress(press({ additive: true }), idle)).toBe('marquee');
  });

  it('pans everywhere in pan mode and pinches with a second pointer', () => {
    const panMode = { ...idle, panMode: true };
    expect(classifyPress(press({ nodeId: 'a' }), panMode)).toBe('pan');
    expect(classifyPress(press({ additive: true }), panMode)).toBe('pan');
    expect(classifyPress(press({ nodeId: 'a', down: 1 }), idle)).toBe('pinch');
    expect(classifyPress(press({ down: 1 }), { ...idle, current: 'nodeDrag' })).toBe('pinch');
  });

  it('resizes from the handle of a lone pointer and holds off everything meanwhile', () => {
    expect(classifyPress(press({ nodeId: 'a', handle: true, control: true }), idle)).toBe('resize');
    expect(classifyPress(press({ handle: true, down: 1 }), idle)).toBe('ignore');
    const resizing = { ...idle, current: 'resize' as const };
    expect(classifyPress(press({ down: 1 }), resizing)).toBe('ignore');
  });

  it('leaves other buttons, controls, the edited title and modified node clicks alone', () => {
    expect(classifyPress(press({ button: 2 }), idle)).toBe('ignore');
    expect(classifyPress(press({ nodeId: 'a', control: true }), idle)).toBe('ignore');
    expect(classifyPress(press({ nodeId: 'a' }), { ...idle, editingId: 'a' })).toBe('ignore');
    expect(classifyPress(press({ nodeId: 'b' }), { ...idle, editingId: 'a' })).toBe('nodeDrag');
    expect(classifyPress(press({ nodeId: 'a', additive: true }), idle)).toBe('ignore');
  });
});

describe('gesture helpers', () => {
  const view = { x: 10, y: 20, zoom: 1 };

  it('tells which gestures hold the canvas', () => {
    expect(isBusy({ kind: 'idle' })).toBe(false);
    expect(isBusy(startPan({ x: 0, y: 0 }, view, true))).toBe(false);
    expect(isBusy({ kind: 'resize', pointerId: 1 })).toBe(true);
    expect(isBusy({ kind: 'marquee', pointerId: 1, start: view, end: view, origin: view })).toBe(
      true,
    );
  });

  it('counts movement from the drag threshold on', () => {
    expect(travelled({ x: 0, y: 0 }, { x: DRAG_THRESHOLD - 1, y: 0 })).toBe(false);
    expect(travelled({ x: 0, y: 0 }, { x: 0, y: DRAG_THRESHOLD })).toBe(true);
  });

  it('pans by the distance moved since the press', () => {
    expect(panView({ start: { x: 100, y: 100 }, view }, { x: 130, y: 90 })).toEqual({
      x: 40,
      y: 10,
      zoom: 1,
    });
  });

  it('pinches around the fingers’ midpoint', () => {
    const pinch = startPinch(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      view,
    );
    expect(pinch).toMatchObject({ kind: 'pinch', start: { x: 150, y: 100 }, distance: 100 });
    if (pinch.kind !== 'pinch') throw new Error('not a pinch');
    const local = (point: { x: number; y: number }) => ({ x: point.x - 50, y: point.y });
    const spread = pinchView(
      pinch,
      [
        { x: 50, y: 100 },
        { x: 250, y: 100 },
      ],
      local,
    );
    expect(spread.zoom).toBe(2);
    // The map point under the midpoint stays under it.
    expect((100 - spread.x) / spread.zoom).toBe((100 - view.x) / view.zoom);
    // Fingers on one spot keep the zoom instead of dividing by zero.
    expect(pinchView({ ...pinch, distance: 0 }, [pinch.start, pinch.start], local).zoom).toBe(1);
  });

  it('measures the marquee in viewport pixels whichever way it is dragged', () => {
    const origin = { x: 10, y: 20 };
    expect(marqueeRect({ start: { x: 110, y: 120 }, end: { x: 60, y: 220 }, origin })).toEqual({
      x: 50,
      y: 100,
      width: 50,
      height: 100,
    });
  });
});
