import { useEffect, useRef } from 'react';
import type { Draft, DraftStore } from '../adapters/storage/drafts';

export function useDraftPersistence(
  store: DraftStore,
  draft: Omit<Draft, 'updatedAt'>,
  enabled: boolean,
  onStatus: (status: string) => void,
  onError: (message: string) => void,
) {
  const queue = useRef(Promise.resolve());
  const {
    content,
    original,
    filename,
    filenamePending,
    savedContent,
    savedFilename,
    drive,
    driveBaseline,
  } = draft;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    onStatus('app.savingDraft');
    const timer = window.setTimeout(() => {
      const snapshot = {
        content,
        original,
        filename,
        filenamePending,
        savedContent,
        savedFilename,
        drive,
        driveBaseline,
        updatedAt: Date.now(),
      };
      queue.current = queue.current.catch(() => {}).then(() => store.save(snapshot));
      queue.current
        .then(() => {
          if (active) onStatus('app.draftSavedBrowser');
        })
        .catch(() => {
          if (active) {
            onStatus('app.draftSaveFailed');
            onError('app.couldNotSaveBrowserDraft');
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    store,
    enabled,
    content,
    original,
    filename,
    filenamePending,
    savedContent,
    savedFilename,
    drive,
    driveBaseline,
    onStatus,
    onError,
  ]);
}
