export interface DriveSyncStatus {
  kind: 'ready' | 'pending' | 'saving' | 'synced' | 'error' | 'reconnect' | 'expiring';
  label: string;
}
interface SyncInput {
  connected: boolean;
  expiring: boolean;
  hasFolder: boolean;
  awaitingRestore: boolean;
  busy: boolean;
  saving: boolean;
  paused: boolean;
  conflict: boolean;
  dirty: boolean;
  hasFile: boolean;
}
export function driveSyncStatus(state: SyncInput): DriveSyncStatus {
  if (state.busy)
    return {
      kind: 'saving',
      label: state.awaitingRestore
        ? 'drive.restoringConnection'
        : state.saving
          ? 'drive.saving'
          : 'drive.checking',
    };
  if (state.awaitingRestore || !state.connected)
    return { kind: 'reconnect', label: 'drive.reconnectRequired' };
  if (state.paused)
    return { kind: 'error', label: state.conflict ? 'drive.syncConflict' : 'drive.syncError' };
  if (state.expiring) return { kind: 'expiring', label: 'drive.connectionExpiring' };
  if (!state.hasFolder) return { kind: 'ready', label: 'drive.chooseSaveFolder' };
  if (state.dirty) return { kind: 'pending', label: 'drive.pendingSave' };
  if (!state.hasFile) return { kind: 'ready', label: 'drive.readySave' };
  return { kind: 'synced', label: 'drive.synced' };
}

/** Latest Drive operation outcome. Logic compares kinds; only the UI reads labels. */
export const DRIVE_ACTIVITY = {
  idle: 'drive.notConnected',
  saving: 'drive.savingDrive',
  saved: 'drive.savedDrive',
  waiting: 'drive.waitingSaveDrive',
  conflict: 'drive.conflictCurrentEditsKept',
  saveFailed: 'drive.saveFailedCurrentEditsKept',
  reconnected: 'drive.reconnectedSaveLocationFile',
  folderSelected: 'drive.saveFolderSelectedOpenFile',
  folderCancelled: 'drive.saveLocationSelectionCancelled',
  fileCancelled: 'drive.fileSelectionCancelled',
  opened: 'drive.driveFileOpened',
  openFailed: 'drive.openFailedLocalFileKept',
  disconnected: 'drive.disconnected',
} as const;
export type DriveActivity = keyof typeof DRIVE_ACTIVITY;

export const AUTO_SAVE_LABELS = {
  restoring: 'drive.restoringDriveConnection',
  reconnect: 'drive.reconnectDrive',
  stopped: 'drive.driveAutosavePaused',
  saving: 'drive.savingDrive',
  waiting: 'drive.waitingSaveDrive',
  ready: 'drive.editsSavedAutomaticallySelectedFolder',
  saved: 'drive.savedDrive',
} as const;
export type AutoSaveState = keyof typeof AUTO_SAVE_LABELS;

interface AutoSaveInput {
  hasFolder: boolean;
  awaitingRestore: boolean;
  busy: boolean;
  paused: boolean;
  connected: boolean;
  dirty: boolean;
  hasFile: boolean;
}
export function autoSaveState(state: AutoSaveInput): AutoSaveState | null {
  if (!state.hasFolder) return null;
  if (state.awaitingRestore) return state.busy ? 'restoring' : 'reconnect';
  if (state.paused || !state.connected) return 'stopped';
  if (state.busy) return 'saving';
  if (state.dirty) return 'waiting';
  return state.hasFile ? 'saved' : 'ready';
}
