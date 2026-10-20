import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { MindMap } from '../domain/model';
import type { CanvasControls, CanvasView } from './canvas-types';

export function useAutoArrange(
  map: MindMap,
  action: () => void,
  controls: RefObject<CanvasControls | null>,
) {
  const previous = useRef(map);
  const revision = useRef(0);
  const transitions = useRef(new WeakMap<MindMap, WeakMap<MindMap, CanvasView>>());
  useLayoutEffect(() => {
    const view = transitions.current.get(previous.current)?.get(map);
    if (previous.current !== map) revision.current++;
    previous.current = map;
    if (view) controls.current?.restoreView(view);
  }, [map, controls]);
  const remember = (from: MindMap, to: MindMap, view: CanvasView) => {
    let next = transitions.current.get(from);
    if (!next) {
      next = new WeakMap();
      transitions.current.set(from, next);
    }
    next.set(to, view);
  };
  return () => {
    const before = controls.current?.getView();
    const started = revision.current;
    action();
    // React commits the new map and Canvas layout before the next frame.
    requestAnimationFrame(() => {
      const arranged = previous.current;
      if (arranged === map && started !== revision.current) return;
      const after = controls.current?.fit();
      if (before && after && arranged !== map) {
        remember(map, arranged, after);
        remember(arranged, map, before);
      }
    });
  };
}
