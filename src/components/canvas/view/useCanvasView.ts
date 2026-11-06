import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { NodePosition } from '../../../domain/model';
import type { Box } from '../../../engine/geometry';
import {
  centerOn,
  MIN_FIT_ZOOM,
  panBy,
  revealRect,
  toMapPoint,
  wheelZoomFactor,
  zoomAround,
  type Size,
  type View,
} from '../../../engine/viewport';
import { useLatest } from '../../shared/useLatest';

/** The viewport size; `measured` tells the real size from the guess before it arrives. */
export type ViewportSize = Size & { measured: boolean };

export interface CanvasCamera {
  view: View;
  /** The committed view, for event handlers and imperative callers. */
  viewRef: RefObject<View>;
  setView: Dispatch<SetStateAction<View>>;
  size: ViewportSize;
  /** A screen point relative to the viewport's top-left corner. */
  toViewport(clientX: number, clientY: number): NodePosition;
  /** Map coordinates under a screen point. */
  toMap(clientX: number, clientY: number): NodePosition;
  /** Zoom by `factor` around a viewport point, by default the middle. */
  zoomAt(factor: number, anchor?: NodePosition): void;
  centerOn(point: NodePosition): void;
  /** Bring a map rectangle into view unless it is already comfortably visible. */
  reveal(rect: Box): void;
}

/** Pan and zoom of the canvas and the size of its viewport. */
export function useCanvasView(viewport: RefObject<HTMLElement | null>): CanvasCamera {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: MIN_FIT_ZOOM });
  const viewRef = useLatest(view);
  const [size, setSize] = useState<ViewportSize>({ width: 900, height: 650, measured: false });
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height, measured: true });
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [viewport]);
  const toViewport = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewport.current!.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [viewport],
  );
  const toMap = useCallback(
    (clientX: number, clientY: number) => toMapPoint(viewRef.current, toViewport(clientX, clientY)),
    [viewRef, toViewport],
  );
  const zoomAt = useCallback(
    (factor: number, anchor = { x: size.width / 2, y: size.height / 2 }) =>
      setView((current) => zoomAround(current, current.zoom * factor, anchor)),
    [size],
  );
  const center = useCallback(
    (point: NodePosition) => setView((current) => centerOn(current, point, size)),
    [size],
  );
  const reveal = useCallback(
    (rect: Box) => setView((current) => revealRect(current, rect, size)),
    [size],
  );
  return {
    view,
    viewRef,
    setView,
    size,
    toViewport,
    toMap,
    zoomAt,
    centerOn: center,
    reveal,
  };
}

/** Wheel pans the canvas; with Ctrl/⌘ (and trackpad pinch) it zooms around the pointer. */
export function useWheelNavigation(
  viewport: RefObject<HTMLElement | null>,
  { setView, zoomAt, toViewport }: Pick<CanvasCamera, 'setView' | 'zoomAt' | 'toViewport'>,
  isBusy: () => boolean,
) {
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      // React registers wheel listeners as passive, so this one is attached by hand.
      event.preventDefault();
      if (isBusy()) return;
      if (event.ctrlKey || event.metaKey)
        zoomAt(wheelZoomFactor(event.deltaY), toViewport(event.clientX, event.clientY));
      else setView((current) => panBy(current, -event.deltaX, -event.deltaY));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [viewport, setView, zoomAt, toViewport, isBusy]);
}
