import { useI18n } from '../../i18n/react';
import {
  useEffect,
  useMemo,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useEditingLayout } from './node/useEditingLayout';
import { useNodeResize } from './gestures/useNodeResize';
import { canvasClipboard, canvasKeydown } from './canvas-keyboard';
import { CanvasNodes, useNodeActions } from './CanvasNodes';
import type { CanvasProps } from './canvas-types';
export type { CanvasControls, CanvasProps } from './canvas-types';
import { BranchRegions } from './BranchRegions';
import { dropIndicator } from '../../engine/branch-drag';
import { ZOOM_STEP } from '../../engine/viewport';
import { useCanvasPointer } from './gestures/useCanvasPointer';
import { useCanvasView, useWheelNavigation } from './view/useCanvasView';
import { useViewportFit } from './view/useViewportFit';
import { focusLayout } from '../../engine/layout/focus';
import { CanvasLines } from './CanvasLines';
import { Minimap } from './view/Minimap';
import { anchorBelow, anchorCenter, focusNodeLater, menuAnchor, nodeElement } from './canvas-dom';
import { usePreferences } from '../shared/preferences';
import { useLatest } from '../shared/useLatest';

export function Canvas(props: CanvasProps) {
  const { t } = useI18n();
  const { map, selected, selection, documentKey, editingId, controlsRef, onZoomChange } = props;
  const { layout: fullLayout, onDraftChange } = useEditingLayout(map, editingId, documentKey);
  const focusId = props.focusId && Object.hasOwn(map.nodes, props.focusId) ? props.focusId : null;
  const viewport = useRef<HTMLDivElement>(null);
  const camera = useCanvasView(viewport);
  const { view, viewRef, setView, size, zoomAt, toMap, reveal } = camera;
  const resize = useNodeResize(map, fullLayout, props.onResize);
  const baseLayout = useMemo(
    () => (focusId ? focusLayout(map, resize.layout, focusId) : resize.layout),
    [map, resize.layout, focusId],
  );
  const [panMode, setPanMode] = useState(false);
  const [{ highlight }] = usePreferences();
  const pointer = useCanvasPointer({
    map,
    selected,
    selection,
    documentKey,
    editingId,
    onSelect: props.onSelect,
    onSelectNodes: props.onSelectNodes,
    onReposition: props.onReposition,
    onReparent: props.onReparent,
    layout: baseLayout,
    camera,
    viewport,
    panMode,
    resize: resize.gesture,
  });
  const { dragPreview, isBusy } = pointer;
  const layout = dragPreview?.layout ?? baseLayout;
  const layoutRef = useLatest(layout);
  const fit = useViewportFit(layoutRef, size, documentKey, setView);
  useWheelNavigation(viewport, camera, isBusy);
  // Entering or leaving a focused branch frames what is now shown.
  const framedFocus = useRef(focusId);
  useLayoutEffect(() => {
    if (framedFocus.current === focusId) return;
    framedFocus.current = focusId;
    fit();
  }, [focusId, fit]);
  // The view follows the selection once it nears an edge, but never mid-gesture.
  useEffect(() => {
    if (isBusy()) return;
    const node = layoutRef.current.nodes.find((n) => n.id === selected);
    if (node) reveal(node);
  }, [selected, size, documentKey, isBusy, reveal, layoutRef]);
  useImperativeHandle(
    controlsRef,
    () => ({
      zoomIn: () => zoomAt(ZOOM_STEP),
      zoomOut: () => zoomAt(1 / ZOOM_STEP),
      fit: () => fit(),
      getView: () => viewRef.current,
      restoreView: setView,
      toMap,
    }),
    [zoomAt, fit, viewRef, setView, toMap],
  );
  useEffect(() => {
    onZoomChange(view.zoom);
  }, [view.zoom, onZoomChange]);
  const nodeActions = useNodeActions({
    selected,
    selection,
    onSelect: props.onSelect,
    onToggleSelect: props.onToggleSelect,
    onSelectNodes: props.onSelectNodes,
    onEdit: props.onEdit,
    onRename: props.onRename,
    onCancelEdit: props.onCancelEdit,
    onAdd: props.onAdd,
    onToggle: props.onToggle,
    onContextMenu: props.onContextMenu,
    onToggleTask: props.onToggleTask,
    viewport,
    onDraftChange,
    resizeHandle: resize.handleProps,
  });
  const drop = dropIndicator(layout, dragPreview?.target);
  const keydown = (event: KeyboardEvent) => {
    canvasKeydown(event, props, {
      isBusy,
      cancelGesture: pointer.cancel,
      pan: () => setPanMode(true),
      selectAll: () =>
        props.onSelectNodes(
          layout.nodes.map((node) => node.id),
          selected,
        ),
      openMenu: () => {
        const element = viewport.current && nodeElement(viewport.current, selected);
        if (element) props.onContextMenu(selected, anchorBelow(element.getBoundingClientRect()));
      },
      focusNode: (id) => focusNodeLater(id, { root: () => viewport.current }),
      highlight,
    });
    // Plain keys on a node are the canvas's (arrows, Space, Delete, ?) and stop here;
    // modified ones go on to the app's shortcuts such as save, undo and zoom.
    const fromNode = (event.target as Element).closest('[data-node-id]');
    if (fromNode && !event.metaKey && !event.ctrlKey) event.stopPropagation();
  };
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
      {...canvasClipboard(props)}
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
        props.onCanvasMenu(menuAnchor(event, anchorCenter(rect)));
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
        {drop?.kind === 'line' && (
          <div
            className="drop-line"
            data-drop-label={t('canvas.insertHere')}
            style={{ left: drop.x, top: drop.y, width: drop.width }}
          />
        )}
        <CanvasNodes
          map={map}
          layout={layout}
          selected={selected}
          selection={selection}
          editingId={editingId}
          dragging={dragPreview?.ids}
          drop={drop}
          matches={props.matches}
          actions={nodeActions}
        />
      </div>
      {dragPreview && (
        <p className={`drag-hint ${dragPreview.free ? 'free' : ''}`} role="status">
          {dragPreview.free ? t('canvas.dragHintFree') : t('canvas.dragHint')}
        </p>
      )}
      {props.minimap && !dragPreview && (
        <Minimap
          map={map}
          layout={layout}
          view={view}
          size={size}
          selection={selection}
          matches={props.matches}
          onCenter={camera.centerOn}
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
