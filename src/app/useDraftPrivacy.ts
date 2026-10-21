import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DraftStore } from '../adapters/storage/drafts';
import { DRAFT_PRIVACY_KEY, keepLocalDrafts } from '../adapters/storage/privacy';

export function useDraftPrivacy(
  store: DraftStore,
  status: (message: string) => void,
  error: (message: string) => void,
) {
  const [enabled, setEnabled] = useState(store.enabled);
  const [busy, setBusy] = useState(false);
  const change = async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    try {
      await store.configure(next);
      status(next ? 'app.automaticDraftStorageEnabled' : 'app.deviceDraftStorageOff');
    } catch {
      error('app.couldNotDeleteDeviceDrafts');
    } finally {
      setBusy(false);
    }
  };
  const latestChange = useRef(change);
  useLayoutEffect(() => {
    latestChange.current = change;
  });
  // Follow the setting when another tab changes it; subscribe once, not on every render.
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === DRAFT_PRIVACY_KEY || event.key === null)
        void latestChange.current(keepLocalDrafts());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return { enabled, busy, change };
}
