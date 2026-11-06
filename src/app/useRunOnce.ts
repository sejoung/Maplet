import { useEffect, useRef } from 'react';
import { useLatest } from '../components/shared/useLatest';

/** Run `run` the first time `ready` holds, and never again for this component. */
export function useRunOnce(ready: boolean, run: () => unknown) {
  const done = useRef(false);
  const latest = useLatest(run);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    void latest.current();
  }, [ready, latest]);
}
