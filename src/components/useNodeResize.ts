import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { MindMap, NodePosition } from '../domain/model';
import { clampNodeSize, resizeNode, type NodeSize } from '../domain/node-size';
import { layoutMap, type Layout } from '../engine/layout';

export type ResizeAction = (
  id: string,
  size: NodeSize | null,
  positions: Record<string, NodePosition>,
) => boolean;

export function useNodeResize(map: MindMap, base: Layout, zoom: number, onResize: ResizeAction) {
  type Preview = {
    source: MindMap;
    id: string;
    size: NodeSize;
    positions: Record<string, NodePosition>;
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const drag = useRef<
    | (Preview & {
        pointer: number;
        x: number;
        y: number;
        zoom: number;
        origin: NodeSize;
        moved: boolean;
      })
    | null
  >(null);
  const layout = useMemo(
    () =>
      preview?.source === map
        ? layoutMap(resizeNode(map, preview.id, preview.size, preview.positions))
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
      const size = { width: placed.width, height: placed.height };
      drag.current = {
        source: map,
        id,
        size: clampNodeSize(size),
        origin: size,
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
      current.size = clampNodeSize({
        width: current.origin.width + dx / current.zoom,
        height: current.origin.height + dy / current.zoom,
      });
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
      if (
        current.moved &&
        (placed.width !== current.origin.width || placed.height !== current.origin.height)
      )
        onResize(id, current.size, current.positions);
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
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const node = base.nodes.find((node) => node.id === id)!;
      const step = event.shiftKey ? 25 : 10;
      onResize(
        id,
        clampNodeSize({
          width:
            node.width +
            (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
          height:
            node.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
        }),
        positions(),
      );
    },
  });
  return { layout, active: preview?.source === map, handlers };
}
