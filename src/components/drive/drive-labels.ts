import type { AutoSaveState, DriveActivity, DriveSyncKind } from '../../application/drive-sync';

/** How the sync control looks: its icon, color and whether it asks for attention. */
export type SyncTone =
  'ready' | 'pending' | 'saving' | 'synced' | 'error' | 'reconnect' | 'expiring';

const SYNC: Record<DriveSyncKind, { label: string; tone: SyncTone }> = {
  restoring: { label: 'drive.restoringConnection', tone: 'saving' },
  saving: { label: 'drive.saving', tone: 'saving' },
  checking: { label: 'drive.checking', tone: 'saving' },
  reconnect: { label: 'drive.reconnectRequired', tone: 'reconnect' },
  conflict: { label: 'drive.syncConflict', tone: 'error' },
  error: { label: 'drive.syncError', tone: 'error' },
  expiring: { label: 'drive.connectionExpiring', tone: 'expiring' },
  chooseFolder: { label: 'drive.chooseSaveFolder', tone: 'ready' },
  ready: { label: 'drive.readySave', tone: 'ready' },
  pending: { label: 'drive.pendingSave', tone: 'pending' },
  synced: { label: 'drive.synced', tone: 'synced' },
};

/** The sync state as shown; while a node is being edited a calm state reads as editing. */
export function syncPresentation(kind: DriveSyncKind, editing: boolean) {
  const shown = SYNC[kind];
  return editing && ['synced', 'pending', 'ready'].includes(shown.tone)
    ? { label: 'drive.editing', tone: 'pending' as const }
    : shown;
}

export const DRIVE_ACTIVITY_LABELS: Record<DriveActivity, string> = {
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
};

export const AUTO_SAVE_LABELS: Record<AutoSaveState, string> = {
  restoring: 'drive.restoringDriveConnection',
  reconnect: 'drive.reconnectDrive',
  stopped: 'drive.driveAutosavePaused',
  saving: 'drive.savingDrive',
  waiting: 'drive.waitingSaveDrive',
  ready: 'drive.editsSavedAutomaticallySelectedFolder',
  saved: 'drive.savedDrive',
};
