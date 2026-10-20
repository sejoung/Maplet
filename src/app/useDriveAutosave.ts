import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDriveAutosave(
  enabled: boolean,
  save: () => void,
  content: string,
  filename: string,
  documentKey: number,
) {
  const latest = useRef(save);
  const waitingSince = useRef<{ key: number; time: number } | null>(null);
  useLayoutEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    if (!enabled) {
      waitingSince.current = null;
      return;
    }
    if (waitingSince.current?.key !== documentKey)
      waitingSince.current = { key: documentKey, time: Date.now() };
    const remaining = Math.max(0, 5000 - (Date.now() - waitingSince.current.time));
    const timer = window.setTimeout(
      () => {
        waitingSince.current = null;
        latest.current();
      },
      Math.min(1500, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [enabled, content, filename, documentKey]);
}
