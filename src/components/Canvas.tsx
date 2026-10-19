import { useI18n } from '../i18n/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { CanvasNodes } from './CanvasNodes';
import type { CanvasProps } from './canvas-types';
export type { CanvasControls, CanvasProps } from './canvas-types';
import type { NodePosition } from '../domain/model';
import { layoutMap, moveLayoutSubtree } from '../engine/layout';
import { positionsForSubtreeMove } from '../domain/positions';

export function Canvas(props: CanvasProps) {
  const { t } = useI18n();
  const {
    map,
    selected,
    documentKey,
    onSelect,
    onEdit,
    onAdd,
    onDelete,
    onToggle,
    onReposition,
    editingId,
    controlsRef,
    onZoomChange,
  } = props;
  const baseLayout = useMemo(() => layoutMap(map), [map]);
  const [dragPreview, setDragPreview] = useState<{ id: string; position: NodePosition } | null>(
    null,
  );
  const layout = useMemo(
    () =>
      dragPreview
        ? moveLayoutSubtree(map, baseLayout, dragPreview.id, dragPreview.position)
        : baseLayout,
    [map, baseLayout, dragPreview],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
  const [panMode, setPanMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const nodeDrag = useRef<{
    pointerId: number;
    id: string;
    x: number;
    y: number;
    zoom: number;
    origin: NodePosition;
    position: NodePosition;
    positions: Record<string, NodePosition>;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const cancelNodeDrag = () => {
    nodeDrag.current = null;
    setDragPreview(null);
  };
  const gesture = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    distance: number;
    zoom: number;
  } | null>(null);
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  const fit = useCallback(
    (initial = false) => {
      const mapLayout = layoutRef.current;
      const zoom = Math.max(
        initial ? 0.85 : 0.15,
        Math.min(1, (size.width - 60) / mapLayout.width, (size.height - 120) / mapLayout.height),
      );
      setView({
        zoom,
        x: (size.width - mapLayout.width * zoom) / 2 - mapLayout.minX * zoom,
        y: (size.height - mapLayout.height * zoom) / 2 - mapLayout.minY * zoom,
      });
    },
    [size],
  );
  useEffect(() => {
    fit(true);
  }, [documentKey, fit]);
  useEffect(() => {
    if (nodeDrag.current) return;
    const node = layoutRef.current.nodes.find((n) => n.id === selected);
    if (!node) return;
    setView((current) => {
      const cx = current.x + (node.x + node.width / 2) * current.zoom;
      const cy = current.y + (node.y + node.height / 2) * current.zoom;
      if (cx < 40 || cx > size.width - 40 || cy < 40 || cy > size.height - 90)
        return {
          ...current,
          x: size.width / 2 - (node.x + node.width / 2) * current.zoom,
          y: size.height / 2 - (node.y + node.height / 2) * current.zoom,
        };
      return current;
    });
  }, [selected, size, documentKey]);
  const zoomAt = useCallback(
    (factor: number, x = size.width / 2, y = size.height / 2) =>
      setView((current) => {
        const zoom = Math.max(0.15, Math.min(2.5, current.zoom * factor));
        return {
          zoom,
          x: x - ((x - current.x) * zoom) / current.zoom,
          y: y - ((y - current.y) * zoom) / current.zoom,
        };
      }),
    [size],
  );
  useImperativeHandle(
    controlsRef,
    () => ({ zoomIn: () => zoomAt(1.2), zoomOut: () => zoomAt(1 / 1.2), fit: () => fit() }),
    [zoomAt, fit],
  );
  useEffect(() => {
    onZoomChange(view.zoom);
  }, [view.zoom, onZoomChange]);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (nodeDrag.current) return;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        zoomAt(
          Math.exp(-event.deltaY * 0.008),
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      } else
        setView((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('button,input,textarea,select')) return;
    if (event.nativeEvent.isComposing) return;
    const node = map.nodes[selected];
    if (event.key === 'Escape' && nodeDrag.current) {
      event.preventDefault();
      cancelNodeDrag();
      gesture.current = null;
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      onAdd();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onAdd(true);
    } else if (event.key === 'F2') {
      event.preventDefault();
      onEdit();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      let next: string | undefined;
      if (event.key === 'ArrowLeft')
        next = node.side === 'left' ? node.children[0] : (node.parentId ?? undefined);
      if (event.key === 'ArrowRight')
        next = node.side === 'left' ? (node.parentId ?? undefined) : node.children[0];
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const siblings = node.parentId ? map.nodes[node.parentId].children : map.roots;
        next = siblings[siblings.indexOf(selected) + (event.key === 'ArrowUp' ? -1 : 1)];
      }
      if (next) {
        if (node.collapsed && node.children.includes(next)) onToggle(selected);
        onSelect(next);
        requestAnimationFrame(() =>
          viewport.current
            ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(next!)}"]`)
            ?.focus(),
        );
      }
    } else if (event.key === ' ') {
      event.preventDefault();
      setPanMode(true);
    }
  };
  // A spatial canvas owns keyboard gestures; individual treeitems expose navigation to assistive tools.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={viewport}
      role="application"
      aria-label={t('마인드맵 캔버스')}
      tabIndex={0}
      className={`canvas ${panning || panMode ? 'is-panning' : ''} ${dragPreview ? 'is-dragging' : ''}`}
      onKeyDown={keydown}
      onKeyUp={(event) => {
        if (event.key === ' ') setPanMode(false);
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.button !== 0 || target.closest('button,input,textarea,select,a')) return;
        const nodeElement = target.closest<HTMLElement>('[data-node-id]');
        const id = nodeElement?.dataset.nodeId;
        if (id === editingId) return;
        suppressClick.current = false;
        // Capture on the node so ordinary clicks and double-clicks keep their target.
        const captureTarget = nodeElement && !panMode ? nodeElement : viewport.current!;
        captureTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...pointers.current.values()];
        if (points.length === 1 && id && !panMode) {
          const placed = layout.nodes.find((node) => node.id === id)!;
          const position = { x: placed.x, y: placed.y };
          nodeDrag.current = {
            pointerId: event.pointerId,
            id,
            x: event.clientX,
            y: event.clientY,
            zoom: view.zoom,
            origin: position,
            position,
            positions: Object.fromEntries(
              layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
            ),
            moved: false,
          };
          gesture.current = null;
          onSelect(id);
          nodeElement!.focus({ preventScroll: true });
          return;
        }
        cancelNodeDrag();
        const mid =
          points.length > 1
            ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
            : points[0];
        gesture.current = {
          x: mid.x,
          y: mid.y,
          vx: view.x,
          vy: view.y,
          distance:
            points.length > 1
              ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
              : 0,
          zoom: view.zoom,
        };
        setPanning(true);
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const drag = nodeDrag.current;
        if (drag && drag.pointerId === event.pointerId) {
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (!drag.moved && Math.hypot(dx, dy) < 4) return;
          drag.moved = true;
          drag.position = { x: drag.origin.x + dx / drag.zoom, y: drag.origin.y + dy / drag.zoom };
          setDragPreview({ id: drag.id, position: drag.position });
          return;
        }
        const start = gesture.current;
        if (!start) return;
        const points = [...pointers.current.values()];
        if (points.length > 1 && start.distance) {
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          const rect = viewport.current!.getBoundingClientRect();
          const x = (points[0].x + points[1].x) / 2 - rect.left;
          const y = (points[0].y + points[1].y) / 2 - rect.top;
          const zoom = Math.max(0.15, Math.min(2.5, (start.zoom * distance) / start.distance));
          setView({
            zoom,
            x: x - ((start.x - rect.left - start.vx) * zoom) / start.zoom,
            y: y - ((start.y - rect.top - start.vy) * zoom) / start.zoom,
          });
        } else {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          setView((current) => ({ ...current, x: start.vx + dx, y: start.vy + dy }));
        }
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        const drag = nodeDrag.current;
        if (drag?.pointerId === event.pointerId) {
          cancelNodeDrag();
          if (drag.moved) {
            suppressClick.current = true;
            window.setTimeout(() => {
              suppressClick.current = false;
            }, 0);
            if (drag.position.x !== drag.origin.x || drag.position.y !== drag.origin.y)
              onReposition(positionsForSubtreeMove(map, drag.positions, drag.id, drag.position));
          }
        }
        const remaining = [...pointers.current.values()][0];
        const current = viewRef.current;
        gesture.current = remaining
          ? {
              x: remaining.x,
              y: remaining.y,
              vx: current.x,
              vy: current.y,
              distance: 0,
              zoom: current.zoom,
            }
          : null;
        setPanning(Boolean(remaining));
        const captureTarget = event.target as HTMLElement;
        if (captureTarget.hasPointerCapture(event.pointerId))
          captureTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        cancelNodeDrag();
        gesture.current = null;
        setPanning(false);
      }}
      onLostPointerCapture={(event) => {
        if (pointers.current.has(event.pointerId)) {
          pointers.current.clear();
          cancelNodeDrag();
          gesture.current = null;
          setPanning(false);
        }
      }}
    >
      <div
        className="map-layer"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <svg className="connections" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map((edge) => (
            <path
              key={edge.to}
              data-edge-to={edge.to}
              data-edge-from={edge.from}
              d={edge.path}
              stroke="#c4ccd0"
              fill="none"
              strokeWidth="2"
            />
          ))}
        </svg>
        <CanvasNodes
          {...props}
          layout={layout}
          draggingId={dragPreview?.id}
          viewport={viewport}
          onKeyDown={keydown}
        />
      </div>
    </div>
  );
}
