import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from '../../src/engine/fit-layout';
import {
  centerOn,
  panBy,
  REVEAL_BOTTOM_MARGIN,
  REVEAL_MARGIN,
  revealRect,
  toMapPoint,
  toMapRect,
  visibleRect,
  wheelZoomFactor,
  zoomAround,
} from '../../src/engine/viewport';

const view = { x: 100, y: -50, zoom: 2 };
const size = { width: 800, height: 600 };

describe('viewport math', () => {
  it('converts viewport points and rectangles to map coordinates', () => {
    expect(toMapPoint(view, { x: 300, y: 150 })).toEqual({ x: 100, y: 100 });
    expect(toMapRect(view, { x: 100, y: -50, width: 40, height: 20 })).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 10,
    });
    expect(visibleRect(view, size)).toEqual({ x: -50, y: 25, width: 400, height: 300 });
  });

  it('zooms around an anchor so the map point under it stays put', () => {
    const anchor = { x: 300, y: 150 };
    const zoomed = zoomAround(view, 1.5, anchor);
    expect(zoomed.zoom).toBe(1.5);
    expect(toMapPoint(zoomed, anchor)).toEqual(toMapPoint(view, anchor));
    // A pinch also moves that point to where the fingers are now.
    const moved = zoomAround(view, 0.5, anchor, { x: 320, y: 170 });
    expect(toMapPoint(moved, { x: 320, y: 170 })).toEqual(toMapPoint(view, anchor));
  });

  it('clamps zoom to the supported range', () => {
    expect(zoomAround(view, 100, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAround(view, 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });

  it('pans and centers without changing the zoom', () => {
    expect(panBy(view, 10, -5)).toEqual({ x: 110, y: -55, zoom: 2 });
    const centered = centerOn(view, { x: 50, y: 25 }, size);
    expect(centered.zoom).toBe(2);
    expect(toMapPoint(centered, { x: 400, y: 300 })).toEqual({ x: 50, y: 25 });
  });

  it('reveals a rectangle only once it leaves the comfortable area', () => {
    const at = (x: number, y: number) => ({ x, y, width: 0, height: 0 });
    const home = { x: 0, y: 0, zoom: 1 };
    expect(revealRect(home, at(400, 300), size)).toBe(home);
    expect(revealRect(home, at(REVEAL_MARGIN, REVEAL_MARGIN), size)).toBe(home);
    expect(revealRect(home, at(400, size.height - REVEAL_BOTTOM_MARGIN), size)).toBe(home);
    expect(revealRect(home, at(REVEAL_MARGIN - 1, 300), size)).toEqual({ x: 361, y: 0, zoom: 1 });
    expect(revealRect(home, at(400, size.height - REVEAL_BOTTOM_MARGIN + 1), size)).toEqual({
      x: 0,
      y: -211,
      zoom: 1,
    });
    // The rectangle's middle decides.
    expect(revealRect(home, { x: 700, y: 100, width: 100, height: 20 }, size)).toBe(home);
    expect(revealRect(home, { x: 720, y: 100, width: 100, height: 20 }, size).x).toBe(-370);
  });

  it('zooms the wheel symmetrically in and out', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
  });
});
