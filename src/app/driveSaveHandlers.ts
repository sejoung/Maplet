import { DriveConflict, type DriveFile } from '../adapters/drive/client';
import type { GoogleSelection } from '../adapters/drive/google';
import type { DriveActivity } from '../application/drive-sync';
import type { Message } from '../domain/errors';
import type { DriveSnapshot } from './driveMerge';
import type { SaveResult } from './DriveDocumentSaver';

interface State {
  current(): DriveSnapshot;
  setBusy(value: boolean): void;
  setDriveError(value: Message | null): void;
  setActivity(value: DriveActivity): void;
  setAutoPaused(value: boolean): void;
  setDialog(value: 'drive' | 'conflict' | null): void;
  setDriveFile(value: DriveFile): void;
  setSourceFile(value: DriveFile): void;
  setSaveFolder(value: GoogleSelection): void;
  adopt(snapshot: DriveSnapshot, file: DriveFile): void;
  applyMerge?(base: DriveSnapshot, incoming: DriveSnapshot): void;
  markSaved(content: string, name?: string): void;
  setNotice(value: string): void;
  fail(reason: unknown, show: boolean): void;
}
export function driveSaveHandlers(state: State) {
  const baseline = (snapshot: DriveSnapshot, file: DriveFile) => {
    state.setDriveFile(file);
    state.setSourceFile(file);
    state.adopt(snapshot, file);
    state.setAutoPaused(false);
    state.setDriveError(null);
    state.setDialog(null);
  };
  return {
    begin: () => {
      state.setBusy(true);
      state.setDriveError(null);
      state.setActivity('saving');
    },
    finish: () => state.setBusy(false),
    unchanged: () => state.setDialog(null),
    success: (
      result: SaveResult,
      folder: GoogleSelection,
      requested: DriveSnapshot,
      automatic: boolean,
    ) => {
      baseline(result, result.file);
      state.setSaveFolder(folder);
      state.applyMerge?.(requested, result);
      if (result.filename === requested.filename) state.markSaved(result.content);
      else state.markSaved(result.content, result.filename);
      state.setActivity('saved');
      if (!automatic) state.setNotice('Google Drive에 저장했습니다.');
    },
    resolved: (merged: DriveSnapshot, remote: DriveSnapshot, file: DriveFile) => {
      state.applyMerge?.(state.current(), merged);
      baseline(remote, file);
      if (merged.content === remote.content && merged.filename === remote.filename) {
        state.markSaved(remote.content, remote.filename);
        state.setActivity('saved');
      } else state.setActivity('waiting');
    },
    rebase: (
      before: DriveSnapshot,
      merged: DriveSnapshot,
      remote: DriveSnapshot,
      file: DriveFile,
    ) => {
      state.applyMerge?.(before, merged);
      baseline(remote, file);
      state.setActivity('saving');
    },
    fail: (reason: unknown, automatic: boolean) => {
      state.setAutoPaused(true);
      if (reason instanceof DriveConflict) {
        state.setDialog('conflict');
        state.setActivity('conflict');
      } else {
        state.fail(reason, !automatic);
        if (automatic)
          state.setNotice(
            'Drive 자동 저장이 중지되었습니다. Google Drive에서 다시 저장해 주세요. 현재 편집은 유지됩니다.',
          );
        state.setActivity('saveFailed');
      }
    },
  };
}
