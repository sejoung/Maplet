import { useEffect, useState } from 'react';
import type { DraftRepository } from '../../adapters/storage/drafts';
import { useLatest } from '../../components/shared/useLatest';
import { DRAFT_PRIVACY_KEY, keepLocalDrafts } from '../../adapters/storage/privacy';

export function useDraftPrivacy(
  store: DraftRepository,
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
  const latestChange = useLatest(change);
  // Follow the setting when another tab changes it; subscribe once, not on every render.
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === DRAFT_PRIVACY_KEY || event.key === null)
        void latestChange.current(keepLocalDrafts());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [latestChange]);
  return { enabled, busy, change };
}
