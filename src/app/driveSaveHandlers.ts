import { DriveConflict, type DriveFile } from '../adapters/drive/client';
import type { GoogleSelection } from '../adapters/drive/google';
import type { DriveBaseline, DriveSnapshot } from './driveMerge';
import type { SaveResult } from './DriveDocumentSaver';

interface State {
  current(): DriveSnapshot;
  setBusy(value: boolean): void;
  setDriveError(value: string | null): void;
  setDriveStatus(value: string): void;
  setAutoPaused(value: boolean): void;
  setDialog(value: 'drive' | 'conflict' | null): void;
  setDriveFile(value: DriveFile): void;
  setSourceFile(value: DriveFile): void;
  setSaveFolder(value: GoogleSelection): void;
  setBaseline(value: DriveBaseline): void;
  setDriveSavedContent(value: string): void;
  setDriveSavedFilename(value: string): void;
  applyMerge?(base: DriveSnapshot, incoming: DriveSnapshot): void;
  markSaved(content: string, name?: string): void;
  setNotice(value: string): void;
  fail(reason: unknown, show: boolean): void;
}
export function driveSaveHandlers(state: State) {
  const baseline = (snapshot: DriveSnapshot, file: DriveFile) => {
    state.setDriveFile(file);
    state.setSourceFile(file);
    state.setBaseline({ ...snapshot, fileId: file.id, version: file.version });
    state.setDriveSavedContent(snapshot.content);
    state.setDriveSavedFilename(snapshot.filename);
    state.setAutoPaused(false);
    state.setDriveError(null);
    state.setDialog(null);
  };
  return {
    begin: () => {
      state.setBusy(true);
      state.setDriveError(null);
      state.setDriveStatus('Drive 저장 중…');
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
      state.setDriveStatus('Drive에 저장됨');
      if (!automatic) state.setNotice('Google Drive에 저장했습니다.');
    },
    resolved: (merged: DriveSnapshot, remote: DriveSnapshot, file: DriveFile) => {
      state.applyMerge?.(state.current(), merged);
      baseline(remote, file);
      if (merged.content === remote.content && merged.filename === remote.filename) {
        state.markSaved(remote.content, remote.filename);
        state.setDriveStatus('Drive에 저장됨');
      } else state.setDriveStatus('Drive 저장 대기 중…');
    },
    rebase: (
      before: DriveSnapshot,
      merged: DriveSnapshot,
      remote: DriveSnapshot,
      file: DriveFile,
    ) => {
      state.applyMerge?.(before, merged);
      baseline(remote, file);
      state.setDriveStatus('Drive 저장 중…');
    },
    fail: (reason: unknown, automatic: boolean) => {
      state.setAutoPaused(true);
      if (reason instanceof DriveConflict) {
        state.setDialog('conflict');
        state.setDriveStatus('충돌 · 현재 편집 유지');
      } else {
        state.fail(reason, !automatic);
        if (automatic)
          state.setNotice(
            'Drive 자동 저장이 중지되었습니다. Google Drive에서 다시 저장해 주세요. 현재 편집은 유지됩니다.',
          );
        state.setDriveStatus('저장 실패 · 현재 편집 유지');
      }
    },
  };
}
