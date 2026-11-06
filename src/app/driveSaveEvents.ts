import type { Dispatch } from 'react';
import type { DriveSnapshot } from '../domain/snapshot';
import type { DriveOptions } from './DriveOptions';
import type { DriveWorkspaceAction } from './driveWorkspaceState';
import { isDriveConflict } from './driveRules';
import type { SaveEvents } from './useDriveSaving';

interface Context extends Pick<DriveOptions, 'applyMerge' | 'markSaved' | 'setNotice'> {
  dispatch: Dispatch<DriveWorkspaceAction>;
  /** The document as last rendered. */
  current(): DriveSnapshot;
  clearError(): void;
  fail(reason: unknown, show: boolean): void;
}

/** How save outcomes change the Drive workspace and the open document. */
export function driveSaveEvents({
  dispatch,
  current,
  clearError,
  applyMerge,
  markSaved,
  setNotice,
  fail,
}: Context): SaveEvents {
  return {
    begin: () => dispatch({ type: 'activity', activity: 'saving' }),
    unchanged: () => dispatch({ type: 'close' }),
    success: (result, folder, requested, automatic) => {
      clearError();
      dispatch({ type: 'stored', file: result.file, snapshot: result, activity: 'saved', folder });
      applyMerge?.(requested, result);
      if (result.filename === requested.filename) markSaved(result.content);
      else markSaved(result.content, result.filename);
      if (!automatic) setNotice('drive.savedGoogleDrive');
    },
    resolved: (merged, remote, file) => {
      applyMerge?.(current(), merged);
      clearError();
      const saved = merged.content === remote.content && merged.filename === remote.filename;
      dispatch({ type: 'stored', file, snapshot: remote, activity: saved ? 'saved' : 'waiting' });
      if (saved) markSaved(remote.content, remote.filename);
    },
    rebase: (before, merged, remote, file) => {
      applyMerge?.(before, merged);
      clearError();
      dispatch({ type: 'stored', file, snapshot: remote, activity: 'saving' });
    },
    fail: (reason, automatic) => {
      if (isDriveConflict(reason)) return dispatch({ type: 'conflict' });
      fail(reason, !automatic);
      if (automatic) setNotice('drive.driveAutosaveStoppedSaveAgain');
      dispatch({ type: 'failed', activity: 'saveFailed' });
    },
  };
}
