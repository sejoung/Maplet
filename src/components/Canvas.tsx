import { useI18n } from '../i18n/react';
import {
  useCallback,
  useEffect,
  useMemo,
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
import { focusLayout } from '../engine/focus';
import { CanvasLines } from './CanvasLines';
import { Minimap } from './Minimap';

export function Canvas(props: CanvasProps) {
  const { t } = useI18n();
  const { map, selected, documentKey, onSelect, editingId, controlsRef, onZoomChange } = props;
  const { layout: fullLayout, onDraftChange } = useEditingLayout(map, editingId, documentKey);
  const focusId = props.focusId && Object.hasOwn(map.nodes, props.focusId) ? props.focusId : null;
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
  const resizing = useNodeResize(map, fullLayout, view.zoom, props.onResize);
  const baseLayout = useMemo(
    () => (focusId ? focusLayout(map, resizing.layout, focusId) : resizing.layout),
    [map, resizing.layout, focusId],
  );
  const [panMode, setPanMode] = useState(false);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const pointer = useCanvasPointer({
    ...props,
    layout: baseLayout,
    view,
    viewRef,
    setView,
    viewport,
    panMode,
    resizing: resizing.active,
  });
  const { dragPreview, isDragging } = pointer;
  const layout = dragPreview?.layout ?? baseLayout;
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const { size, fit } = useViewportFit(viewport, layoutRef, documentKey, setView);
  // Entering or leaving a focused branch frames what is now shown.
  const framedFocus = useRef(focusId);
  useLayoutEffect(() => {
    if (framedFocus.current === focusId) return;
    framedFocus.current = focusId;
    fit();
  }, [focusId, fit]);
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
      toMap: (clientX: number, clientY: number) => {
        const rect = viewport.current!.getBoundingClientRect();
        const current = viewRef.current;
        return {
          x: (clientX - rect.left - current.x) / current.zoom,
          y: (clientY - rect.top - current.y) / current.zoom,
        };
      },
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
  const target = dragPreview?.target;
  const beside =
    target && target.place !== 'child' && layout.nodes.find((n) => n.id === target.node);
  const dropLine = beside && {
    x: beside.x,
    y: target.place === 'before' ? beside.y - 9 : beside.y + beside.height + 6,
    width: beside.width,
  };
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
      aria-label={t('canvas.mindMapCanvas')}
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
        <CanvasLines map={map} layout={layout} />
        {dropLine && (
          <div
            className="drop-line"
            data-drop-label={t('canvas.insertHere')}
            style={{ left: dropLine.x, top: dropLine.y, width: dropLine.width }}
          />
        )}
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
          dropTarget={dragPreview?.target}
          matches={props.matches}
          onToggleTask={props.onToggleTask}
          viewport={viewport}
          onKeyDown={keydown}
        />
      </div>
      {dragPreview && (
        <p className={`drag-hint ${dragPreview.free ? 'free' : ''}`} role="status">
          {dragPreview.free ? t('canvas.dragHintFree') : t('canvas.dragHint')}
        </p>
      )}
      {props.minimap && !dragPreview && (
        <Minimap
          layout={layout}
          view={view}
          size={size}
          onCenter={(point) =>
            setView((current) => ({
              ...current,
              x: size.width / 2 - point.x * current.zoom,
              y: size.height / 2 - point.y * current.zoom,
            }))
          }
        />
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
