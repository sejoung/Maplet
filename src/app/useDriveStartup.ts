import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDriveStartup(ready: boolean, restore: () => Promise<void>) {
  const attempted = useRef(false);
  const latest = useRef(restore);
  useLayoutEffect(() => {
    latest.current = restore;
  });
  useEffect(() => {
    if (!ready || attempted.current) return;
    attempted.current = true;
    void latest.current();
  }, [ready]);
}
