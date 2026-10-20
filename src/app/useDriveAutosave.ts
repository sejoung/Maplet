import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDriveAutosave(
  enabled: boolean,
  save: () => void,
  content: string,
  filename: string,
  documentKey: number,
) {
  const latest = useRef(save);
  useLayoutEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => latest.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [enabled, content, filename, documentKey]);
}
