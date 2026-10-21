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
import { canvasClipboard, canvasKeydown } from './canvas-keyboard';
import { CanvasNodes } from './CanvasNodes';
import type { CanvasProps } from './canvas-types';
export type { CanvasControls, CanvasProps } from './canvas-types';
import { BranchRegions } from './BranchRegions';
import { clampZoom } from '../engine/fit-layout';
import { useCanvasPointer } from './useCanvasPointer';
import { useViewportFit } from './useViewportFit';

export function Canvas(props: CanvasProps) {
  const { t } = useI18n();
  const { map, selected, documentKey, onSelect, editingId, controlsRef, onZoomChange } = props;
  const { layout: baseLayout, onDraftChange } = useEditingLayout(map, editingId, documentKey);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
  const resizing = useNodeResize(map, baseLayout, view.zoom, props.onResize);
  const [panMode, setPanMode] = useState(false);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const pointer = useCanvasPointer({
    ...props,
    layout: resizing.layout,
    view,
    viewRef,
    setView,
    viewport,
    panMode,
    resizing: resizing.active,
  });
  const { dragPreview, isDragging } = pointer;
  const layout = dragPreview?.layout ?? resizing.layout;
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const { size, fit } = useViewportFit(viewport, layoutRef, documentKey, setView);
  useEffect(() => {
    if (isDragging()) return;
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
  }, [selected, size, documentKey, isDragging]);
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
      if (isDragging() || resizing.active) return;
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
  }, [zoomAt, resizing.active, isDragging]);
  const keydown = (event: KeyboardEvent) =>
    canvasKeydown(event, props, viewport, {
      isDragging,
      cancelDrag: pointer.cancelDrag,
      pan: () => setPanMode(true),
      selectAll: () =>
        props.onSelectNodes(
          layout.nodes.map((node) => node.id),
          selected,
        ),
      openMenu: () => {
        const element = viewport.current?.querySelector<HTMLElement>(
          `[data-node-id="${CSS.escape(selected)}"]`,
        );
        const rect = element?.getBoundingClientRect();
        if (rect) props.onContextMenu(selected, { x: rect.left + 8, y: rect.bottom + 4 });
      },
    });
  // A spatial canvas owns keyboard gestures; individual treeitems expose navigation to assistive tools.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={viewport}
      role="application"
      aria-label={t('마인드맵 캔버스')}
      tabIndex={0}
      className={`canvas ${pointer.panning || panMode ? 'is-panning' : ''} ${dragPreview ? 'is-dragging' : ''} ${dragPreview?.target ? 'has-drop-target' : ''}`}
      onKeyDown={keydown}
      {...canvasClipboard(props, selected, editingId)}
      onKeyUp={(event) => {
        if (event.key === ' ') setPanMode(false);
      }}
      {...pointer.handlers}
      onContextMenu={(event) => {
        const target = event.target as Element;
        // Nodes open their own menu; text fields keep the browser's.
        if (event.defaultPrevented || target.closest('[data-node-id],input,textarea')) return;
        event.preventDefault();
        const rect = viewport.current!.getBoundingClientRect();
        const keyboard = event.clientX === 0 && event.clientY === 0;
        props.onCanvasMenu(
          keyboard
            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            : { x: event.clientX, y: event.clientY },
        );
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
          selection={props.selection}
          editingId={editingId}
          onSelect={onSelect}
          onToggleSelect={props.onToggleSelect}
          onSelectNodes={props.onSelectNodes}
          onEdit={props.onEdit}
          onRename={props.onRename}
          onCancelEdit={props.onCancelEdit}
          onAdd={props.onAdd}
          onToggle={props.onToggle}
          onContextMenu={props.onContextMenu}
          layout={layout}
          onDraftChange={onDraftChange}
          resizeHandlers={resizing.handlers}
          dragging={dragPreview?.ids}
          dropTarget={dragPreview?.target?.id}
          viewport={viewport}
          onKeyDown={keydown}
        />
      </div>
      {dragPreview && (
        <p className={`drag-hint ${dragPreview.free ? 'free' : ''}`} role="status">
          {dragPreview.free
            ? t('위치만 옮기는 중 · Alt(⌥)를 떼면 부모 바꾸기')
            : t(
                '노드에 붙여 놓으면 하위로 이동 · 점선은 놓을 때 비켜날 자리 · Alt(⌥): 위치만 이동',
              )}
        </p>
      )}
      {pointer.marquee && (
        <div
          className="selection-marquee"
          aria-hidden="true"
          style={{
            left: pointer.marquee.x,
            top: pointer.marquee.y,
            width: pointer.marquee.width,
            height: pointer.marquee.height,
          }}
        />
      )}
    </div>
  );
}
