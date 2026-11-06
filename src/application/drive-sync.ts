/**
 * Drive state as kinds, one per distinct situation. Logic compares kinds; the UI decides how
 * each one reads and looks.
 */
export type DriveSyncKind =
  | 'restoring'
  | 'saving'
  | 'checking'
  | 'reconnect'
  | 'conflict'
  | 'error'
  | 'expiring'
  | 'chooseFolder'
  | 'ready'
  | 'pending'
  | 'synced';
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
export function driveSyncStatus(state: SyncInput): DriveSyncKind {
  if (state.busy) return state.awaitingRestore ? 'restoring' : state.saving ? 'saving' : 'checking';
  if (state.awaitingRestore || !state.connected) return 'reconnect';
  if (state.paused) return state.conflict ? 'conflict' : 'error';
  if (state.expiring) return 'expiring';
  if (!state.hasFolder) return 'chooseFolder';
  if (state.dirty) return 'pending';
  if (!state.hasFile) return 'ready';
  return 'synced';
}

/** Latest Drive operation outcome. */
export type DriveActivity =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'waiting'
  | 'conflict'
  | 'saveFailed'
  | 'reconnected'
  | 'folderSelected'
  | 'folderCancelled'
  | 'fileCancelled'
  | 'opened'
  | 'openFailed'
  | 'disconnected';

export type AutoSaveState =
  'restoring' | 'reconnect' | 'stopped' | 'saving' | 'waiting' | 'ready' | 'saved';

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
