import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { MindMap, NodePosition } from '../domain/model';
import { clampNodeWidth, resizeNode } from '../domain/node-size';
import { measureNodeText } from './text-measure';
import { layoutMap, type Layout } from '../engine/layout';

export type ResizeAction = (
  id: string,
  width: number | null,
  positions: Record<string, NodePosition>,
) => boolean;

export function useNodeResize(map: MindMap, base: Layout, zoom: number, onResize: ResizeAction) {
  type Preview = {
    source: MindMap;
    id: string;
    width: number;
    positions: Record<string, NodePosition>;
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const drag = useRef<
    | (Preview & {
        pointer: number;
        x: number;
        y: number;
        zoom: number;
        origin: number;
        moved: boolean;
      })
    | null
  >(null);
  const layout = useMemo(
    () =>
      preview?.source === map
        ? layoutMap(resizeNode(map, preview.id, preview.width, preview.positions), measureNodeText)
        : base,
    [map, base, preview],
  );
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  useEffect(() => {
    drag.current = null;
  }, [map]);
  const positions = () => Object.fromEntries(base.nodes.map(({ id, x, y }) => [id, { x, y }]));
  const handlers = (id: string): ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerDown(event) {
      event.stopPropagation();
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      const placed = base.nodes.find((node) => node.id === id)!;
      const width = placed.width;
      drag.current = {
        source: map,
        id,
        width: clampNodeWidth(width),
        origin: width,
        positions: positions(),
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        zoom,
        moved: false,
      };
      setPreview({ ...drag.current });
    },
    onPointerMove(event) {
      event.stopPropagation();
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      const dx = event.clientX - current.x,
        dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < 4) return;
      current.moved = true;
      current.width = clampNodeWidth(current.origin + dx / current.zoom);
      setPreview({ ...current });
    },
    onPointerUp(event) {
      event.stopPropagation();
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      const placed = layout.nodes.find((node) => node.id === id)!;
      cancel();
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (current.moved && placed.width !== current.origin)
        onResize(id, current.width, current.positions);
    },
    onPointerCancel(event) {
      event.stopPropagation();
      cancel();
    },
    onLostPointerCapture(event) {
      event.stopPropagation();
      cancel();
    },
    onClick(event) {
      event.stopPropagation();
    },
    onDoubleClick(event) {
      event.stopPropagation();
      cancel();
      onResize(id, null, {});
    },
    onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
      if (drag.current) return;
      if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        onResize(id, null, {});
      }
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const node = base.nodes.find((node) => node.id === id)!;
      const step = event.shiftKey ? 25 : 10;
      onResize(
        id,
        clampNodeWidth(node.width + (event.key === 'ArrowRight' ? step : -step)),
        positions(),
      );
    },
  });
  return { layout, active: preview?.source === map, handlers };
}
