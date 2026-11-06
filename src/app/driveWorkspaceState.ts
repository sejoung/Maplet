import type { DriveFile, DriveFolder } from '../adapters/drive/types';
import type { DriveWorkspace } from '../adapters/storage/drive-workspace';
import type { DriveBaseline, DriveSnapshot } from '../domain/snapshot';
import type { SyncedState } from '../application/drive-restore';
import type { DriveActivity } from '../application/drive-sync';

export type DriveDialog = 'drive' | 'conflict' | null;
export interface PendingRestore {
  workspace: DriveWorkspace;
  /** Keep the local document and merge it with Drive, rather than replacing it. */
  keepLocal: boolean;
}
/** Where this tab saves on Drive and what Drive is known to hold, as one value. */
export interface DriveWorkspaceState {
  folder: DriveFolder | null;
  /** The file autosave writes to. */
  file: DriveFile | null;
  /** The Drive file the document came from; only a copy source when it is not `file`. */
  source: DriveFile | null;
  /** A remembered workspace that has not been reconnected yet. */
  pending: PendingRestore | null;
  synced: SyncedState;
  /** Autosave stopped after a failure or conflict; an explicit save resumes it. */
  paused: boolean;
  activity: DriveActivity;
  dialog: DriveDialog;
}

export type DriveWorkspaceAction =
  | { type: 'show' }
  | { type: 'close' }
  | { type: 'activity'; activity: DriveActivity }
  | { type: 'folderPicked'; folder: DriveFolder | null; local: DriveSnapshot }
  | { type: 'fileCancelled' }
  | { type: 'opened'; file: DriveFile | null; source: DriveFile; snapshot: DriveSnapshot }
  /** `snapshot` is now stored in `file`, which autosave keeps writing to. */
  | {
      type: 'stored';
      file: DriveFile;
      snapshot: DriveSnapshot;
      activity: DriveActivity;
      folder?: DriveFolder;
    }
  | {
      type: 'restored';
      folder: DriveFolder;
      file: DriveFile | null;
      source: DriveFile | null;
      synced: SyncedState;
    }
  | { type: 'restoreConflicted'; file: DriveFile | null; source: DriveFile | null }
  | { type: 'conflict' }
  | { type: 'failed'; activity?: DriveActivity }
  /** The document no longer belongs to a Drive file; `local` counts as clean. */
  | { type: 'cleared'; local: DriveSnapshot }
  | { type: 'disconnected'; local: DriveSnapshot }
  | { type: 'draftRestored'; workspace: DriveWorkspace | null; baseline: DriveBaseline | null };

export const initialDriveWorkspace = (remembered: DriveWorkspace | null): DriveWorkspaceState => ({
  folder: remembered?.folder ?? null,
  file: null,
  source: null,
  pending: remembered ? { workspace: remembered, keepLocal: false } : null,
  synced: { baseline: null, content: null, filename: null },
  paused: false,
  activity: 'idle',
  dialog: null,
});

const adopt = ({ content, filename }: DriveSnapshot, file: DriveFile): SyncedState => ({
  baseline: { content, filename, fileId: file.id, version: file.version },
  content,
  filename,
});
const attach = (
  state: DriveWorkspaceState,
  file: DriveFile | null,
  source: DriveFile,
  snapshot: DriveSnapshot,
): DriveWorkspaceState => ({
  ...state,
  file,
  source,
  synced: adopt(snapshot, source),
  paused: false,
});
const detach = (state: DriveWorkspaceState, local: DriveSnapshot): DriveWorkspaceState => ({
  ...state,
  file: null,
  source: null,
  synced: { baseline: null, content: local.content, filename: local.filename },
  paused: false,
});
const enterConflict = (state: DriveWorkspaceState): DriveWorkspaceState => ({
  ...state,
  paused: true,
  dialog: 'conflict',
  activity: 'conflict',
});

export function driveWorkspaceReducer(
  state: DriveWorkspaceState,
  action: DriveWorkspaceAction,
): DriveWorkspaceState {
  switch (action.type) {
    case 'show':
      return { ...state, dialog: 'drive' };
    case 'close':
      return { ...state, dialog: null };
    case 'activity':
      return { ...state, activity: action.activity };
    case 'folderPicked': {
      const { folder } = action;
      if (!folder) return { ...state, activity: 'folderCancelled', dialog: 'drive' };
      // Another folder, or one chosen instead of a remembered file, starts without a file.
      const moved = folder.id !== state.folder?.id || state.pending;
      return {
        ...(moved ? detach(state, action.local) : state),
        folder,
        pending: null,
        activity: 'folderSelected',
        dialog: 'drive',
      };
    }
    case 'fileCancelled':
      return { ...state, activity: 'fileCancelled', dialog: 'drive' };
    case 'opened':
      return { ...attach(state, action.file, action.source, action.snapshot), activity: 'opened' };
    case 'stored':
      return {
        ...attach(state, action.file, action.file, action.snapshot),
        folder: action.folder ?? state.folder,
        activity: action.activity,
        dialog: null,
      };
    case 'restored':
      return {
        ...state,
        folder: action.folder,
        file: action.file,
        source: action.source,
        synced: action.synced,
        pending: null,
        paused: false,
        activity: 'reconnected',
        dialog: null,
      };
    case 'restoreConflicted':
      return enterConflict({ ...state, file: action.file, source: action.source, pending: null });
    case 'conflict':
      return enterConflict(state);
    case 'failed':
      return { ...state, paused: true, activity: action.activity ?? state.activity };
    case 'cleared':
      return { ...detach(state, action.local), pending: null };
    case 'disconnected':
      return {
        ...detach(state, action.local),
        pending: null,
        folder: null,
        activity: 'disconnected',
      };
    case 'draftRestored': {
      // A draft resumes its Drive file only within the folder this tab already uses.
      const workspace = action.workspace?.folder.id === state.folder?.id ? action.workspace : null;
      return {
        ...state,
        file: null,
        source: null,
        folder: workspace?.folder ?? state.folder,
        pending: workspace ? { workspace, keepLocal: true } : null,
        synced: { ...state.synced, baseline: action.baseline },
      };
    }
  }
}
