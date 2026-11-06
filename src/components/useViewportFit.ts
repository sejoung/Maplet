import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { fitLayout, MIN_ZOOM } from '../engine/fit-layout';
import type { Layout } from '../engine/layout';
import { MIN_FIT_ZOOM, type View } from '../engine/viewport';
import type { ViewportSize } from './useCanvasView';

/** Fit the map into the viewport on request, and each newly opened document once. */
export function useViewportFit(
  layout: RefObject<Layout>,
  size: ViewportSize,
  documentKey: number,
  setView: (view: View) => void,
) {
  const fit = useCallback(
    (initial = false) => {
      const fitted = fitLayout(layout.current, size, initial ? MIN_FIT_ZOOM : MIN_ZOOM);
      setView(fitted);
      return fitted;
    },
    [size, layout, setView],
  );
  const fitted = useRef<{ documentKey: number; measured: boolean } | null>(null);
  const { measured } = size;
  useEffect(() => {
    // Fit each document once, and again when the real viewport size first arrives. Later
    // resizes (window, devtools, a mobile keyboard) keep the user's pan and zoom.
    const previous = fitted.current;
    if (previous?.documentKey === documentKey && (previous.measured || !measured)) return;
    fitted.current = { documentKey, measured };
    fit(true);
  }, [documentKey, fit, measured]);
  return fit;
}
