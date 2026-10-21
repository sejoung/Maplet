import { useI18n } from '../i18n/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useEditingLayout } from './useEditingLayout';
import { useNodeResize } from './useNodeResize';
import { canvasKeydown } from './canvas-keyboard';
import { CanvasNodes } from './CanvasNodes';
import type { CanvasProps } from './canvas-types';
export type { CanvasControls, CanvasProps } from './canvas-types';
import type { MindMap, NodePosition } from '../domain/model';
import { layoutWithPositions, type Layout } from '../engine/layout';
import { proposeSubtreeMove, type PlacementProposal } from '../engine/subtree-placement';
import { BranchRegions } from './BranchRegions';
import { clampZoom } from '../engine/fit-layout';
import { useViewportFit } from './useViewportFit';

export function Canvas(props: CanvasProps) {
  const { t } = useI18n();
  const {
    map,
    selected,
    documentKey,
    onSelect,
    onReposition,
    editingId,
    controlsRef,
    onZoomChange,
  } = props;
  const { layout: baseLayout, onDraftChange } = useEditingLayout(map, editingId, documentKey);
  const [preview, setDragPreview] = useState<{
    id: string;
    source: MindMap;
    documentKey: number;
    layout: Layout;
    regions: PlacementProposal['regions'];
  } | null>(null);
  const dragPreview =
    preview?.source === map && preview.documentKey === documentKey && !editingId ? preview : null;
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
  const resizing = useNodeResize(map, baseLayout, view.zoom, props.onResize);
  const layout = dragPreview?.layout ?? resizing.layout;
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
    layout: Layout;
    proposal: PlacementProposal | null;
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
  useLayoutEffect(() => {
    nodeDrag.current = null;
    setDragPreview(null);
    pointers.current.clear();
    gesture.current = null;
    setPanning(false);
  }, [map, documentKey, editingId]);
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const { size, fit } = useViewportFit(viewport, layoutRef, documentKey, setView);
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
        const zoom = clampZoom(current.zoom * factor);
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
    () => ({
      zoomIn: () => zoomAt(1.2),
      zoomOut: () => zoomAt(1 / 1.2),
      fit: () => fit(),
      getView: () => viewRef.current,
      restoreView: setView,
    }),
    [zoomAt, fit],
  );
  useEffect(() => {
    onZoomChange(view.zoom);
  }, [view.zoom, onZoomChange]);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (nodeDrag.current || resizing.active) return;
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
  }, [zoomAt, resizing.active]);
  const keydown = (event: KeyboardEvent) =>
    canvasKeydown(event, props, viewport, {
      isDragging: () => Boolean(nodeDrag.current),
      cancelDrag: () => {
        cancelNodeDrag();
        gesture.current = null;
      },
      pan: () => setPanMode(true),
    });
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
        if (
          resizing.active ||
          event.button !== 0 ||
          target.closest('button,input,textarea,select,a')
        )
          return;
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
            layout,
            proposal: null,
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
          const position = { x: drag.origin.x + dx / drag.zoom, y: drag.origin.y + dy / drag.zoom };
          // Always resolve from the drag's starting layout so moving away restores
          // displaced branches, and the same proposal is committed on release.
          const proposal = proposeSubtreeMove(map, drag.layout, drag.id, position);
          if (!proposal) return;
          drag.moved = true;
          drag.position = position;
          drag.proposal = proposal;
          setDragPreview({
            id: drag.id,
            source: map,
            documentKey,
            layout: layoutWithPositions(drag.layout, proposal.positions),
            regions: proposal.regions,
          });
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
          const zoom = clampZoom((start.zoom * distance) / start.distance);
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
            if (
              drag.proposal &&
              (drag.position.x !== drag.origin.x ||
                drag.position.y !== drag.origin.y ||
                drag.proposal.displacedIds.length > 0)
            )
              onReposition(drag.proposal.positions);
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
        <BranchRegions regions={dragPreview?.regions} />
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
          map={map}
          selected={selected}
          editingId={editingId}
          onSelect={onSelect}
          onEdit={props.onEdit}
          onRename={props.onRename}
          onCancelEdit={props.onCancelEdit}
          onAdd={props.onAdd}
          onToggle={props.onToggle}
          layout={layout}
          onDraftChange={onDraftChange}
          resizeHandlers={resizing.handlers}
          draggingId={dragPreview?.id}
          viewport={viewport}
          onKeyDown={keydown}
        />
      </div>
    </div>
  );
}
