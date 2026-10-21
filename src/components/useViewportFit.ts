import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { fitLayout, MIN_ZOOM } from '../engine/fit-layout';
import type { Layout } from '../engine/layout';
import type { CanvasView } from './canvas-types';

/** Track the viewport size and fit each newly opened document into it. */
export function useViewportFit(
  viewport: RefObject<HTMLDivElement | null>,
  layout: RefObject<Layout>,
  documentKey: number,
  setView: (view: CanvasView) => void,
) {
  const [size, setSize] = useState({ width: 900, height: 650 });
  const measured = useRef(false);
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      measured.current = true;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [viewport]);
  const fit = useCallback(
    (initial = false) => {
      const fitted = fitLayout(layout.current, size, initial ? 0.85 : MIN_ZOOM);
      setView(fitted);
      return fitted;
    },
    [size, layout, setView],
  );
  const fitted = useRef<{ documentKey: number; measured: boolean } | null>(null);
  useEffect(() => {
    // Fit each document once, and again when the real viewport size first arrives. Later
    // resizes (window, devtools, a mobile keyboard) keep the user's pan and zoom.
    const previous = fitted.current;
    if (previous?.documentKey === documentKey && (previous.measured || !measured.current)) return;
    fitted.current = { documentKey, measured: measured.current };
    fit(true);
  }, [documentKey, fit]);
  return { size, fit };
}
