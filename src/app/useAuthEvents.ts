import { useEffect, useLayoutEffect, useRef } from 'react';
import type { AuthEvent, GoogleConnection } from '../adapters/drive/google';

/** Follow connections, expiries and disconnects made in other tabs. */
export function useAuthEvents(google: GoogleConnection | null, handle: (event: AuthEvent) => void) {
  const latest = useRef(handle);
  useLayoutEffect(() => {
    latest.current = handle;
  });
  useEffect(() => {
    if (!google) return;
    const unsubscribe = google.subscribe((event) => latest.current(event));
    // Another tab may have answered before this hook subscribed.
    if (google.getToken()) latest.current('connected');
    return unsubscribe;
  }, [google]);
}
