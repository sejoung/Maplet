import { useCallback, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { MindMap, NodePosition } from '../domain/model';
import { clampNodeWidth, resizeNode } from '../domain/node-size';
import { measureNodeText } from './text-measure';
import { layoutMap, type Layout } from '../engine/layout';
import { travelled, type Point } from './canvas-gestures';
import { useLatest } from './useLatest';

export type ResizeAction = (
  id: string,
  width: number | null,
  positions: Record<string, NodePosition>,
) => boolean;

/** Resizing by the handle's pointer; the canvas's pointer handling drives it as a gesture. */
export interface ResizeGesture {
  start(id: string, at: Point, zoom: number): void;
  move(at: Point): void;
  /** Commit the width if it changed. */
  finish(): void;
  cancel(): void;
}

interface Preview {
  source: MindMap;
  id: string;
  width: number;
  positions: Record<string, NodePosition>;
}

const positionsOf = (layout: Layout) =>
  Object.fromEntries(layout.nodes.map(({ id, x, y }) => [id, { x, y }]));

/**
 * Node width: dragged on the resize handle with a live preview that keeps every node in
 * place, stepped with the arrow keys, reset with Home or a double click.
 */
export function useNodeResize(map: MindMap, base: Layout, onResize: ResizeAction) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const drag = useRef<
    (Preview & { start: Point; zoom: number; origin: number; moved: boolean }) | null
  >(null);
  const layout = useMemo(
    () =>
      preview?.source === map
        ? layoutMap(resizeNode(map, preview.id, preview.width, preview.positions), measureNodeText)
        : base,
    [map, base, preview],
  );
  // Handlers outlive renders (memoized nodes keep them), so they read the latest values.
  const latest = useLatest({ map, base, layout, onResize });
  const cancel = useCallback(() => {
    drag.current = null;
    setPreview(null);
  }, []);
  const gesture = useMemo<ResizeGesture>(
    () => ({
      start(id, at, zoom) {
        if (drag.current) return;
        const { map, base } = latest.current;
        const width = base.nodes.find((node) => node.id === id)!.width;
        drag.current = {
          source: map,
          id,
          width: clampNodeWidth(width),
          origin: width,
          positions: positionsOf(base),
          start: at,
          zoom,
          moved: false,
        };
        setPreview({ ...drag.current });
      },
      move(at) {
        const current = drag.current;
        if (!current || (!current.moved && !travelled(current.start, at))) return;
        current.moved = true;
        current.width = clampNodeWidth(current.origin + (at.x - current.start.x) / current.zoom);
        setPreview({ ...current });
      },
      finish() {
        const current = drag.current;
        if (!current) return;
        cancel();
        const { map, layout, onResize } = latest.current;
        // A document that changed meanwhile has nothing left to resize.
        if (current.source !== map || !current.moved) return;
        const placed = layout.nodes.find((node) => node.id === current.id)!;
        if (placed.width !== current.origin) onResize(current.id, current.width, current.positions);
      },
      cancel,
    }),
    [latest, cancel],
  );
  /** The handle's own events; its pointer presses reach the canvas. */
  const handleProps = useCallback(
    (id: string): ButtonHTMLAttributes<HTMLButtonElement> => ({
      onClick: (event) => event.stopPropagation(),
      onDoubleClick(event) {
        event.stopPropagation();
        cancel();
        latest.current.onResize(id, null, {});
      },
      onKeyDown(event) {
        if (drag.current) return;
        const { base, onResize } = latest.current;
        if (event.key === 'Home') {
          event.preventDefault();
          event.stopPropagation();
          onResize(id, null, {});
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const node = base.nodes.find((node) => node.id === id)!;
        const step = event.shiftKey ? 25 : 10;
        onResize(
          id,
          clampNodeWidth(node.width + (event.key === 'ArrowRight' ? step : -step)),
          positionsOf(base),
        );
      },
    }),
    [latest, cancel],
  );
  return { layout, gesture, handleProps };
}
