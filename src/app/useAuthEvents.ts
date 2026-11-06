import { useEffect } from 'react';
import type { AuthEvent, DriveAuth } from '../adapters/drive/types';
import { useLatest } from '../components/useLatest';

/** Follow connections, expiries and disconnects made in other tabs. */
export function useAuthEvents(google: DriveAuth | null, handle: (event: AuthEvent) => void) {
  const latest = useLatest(handle);
  useEffect(() => {
    if (!google) return;
    const unsubscribe = google.subscribe((event) => latest.current(event));
    // Another tab may have answered before this hook subscribed.
    if (google.getToken()) latest.current('connected');
    return unsubscribe;
  }, [google, latest]);
}
