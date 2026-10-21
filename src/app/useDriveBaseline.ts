import { useState } from 'react';
import type { DriveFile } from '../adapters/drive/client';
import type { DriveBaseline, DriveSnapshot } from './driveMerge';

interface SyncedState {
  /** Last snapshot known to be on Drive, used as the merge base. */
  baseline: DriveBaseline | null;
  /** Content and name that count as "saved to Drive" for dirty tracking. */
  content: string | null;
  filename: string | null;
}

/** What Drive is known to hold, kept as one value so its parts never drift apart. */
export function useDriveBaseline() {
  const [synced, setSynced] = useState<SyncedState>({
    baseline: null,
    content: null,
    filename: null,
  });
  return {
    ...synced,
    /** `snapshot` is now stored in `file`. */
    adopt: (snapshot: DriveSnapshot, file: DriveFile) =>
      setSynced({
        baseline: { ...snapshot, fileId: file.id, version: file.version },
        content: snapshot.content,
        filename: snapshot.filename,
      }),
    /** No Drive file yet: the given state is clean until it is edited. */
    reset: (content: string | null, filename: string | null) =>
      setSynced({ baseline: null, content, filename }),
    set: setSynced,
    restoreBaseline: (baseline: DriveBaseline | null) =>
      setSynced((current) => ({ ...current, baseline })),
  };
}
