import { expect, it } from 'vitest';
import { autoSaveState, driveSyncStatus } from '../../src/application/drive-sync';
import { syncPresentation } from '../../src/components/drive-labels';

const saved = {
  connected: true,
  expiring: false,
  hasFolder: true,
  awaitingRestore: false,
  busy: false,
  saving: false,
  paused: false,
  conflict: false,
  dirty: false,
  hasFile: true,
};
it.each([
  [{}, 'synced'],
  [{ dirty: true }, 'pending'],
  [{ busy: true, saving: true, dirty: true }, 'saving'],
  [{ busy: true, awaitingRestore: true }, 'restoring'],
  [{ busy: true }, 'checking'],
  [{ awaitingRestore: true }, 'reconnect'],
  [{ connected: false }, 'reconnect'],
  [{ paused: true, dirty: true }, 'error'],
  [{ paused: true, conflict: true }, 'conflict'],
  [{ expiring: true, dirty: true }, 'expiring'],
  [{ expiring: true, paused: true }, 'error'],
  [{ expiring: true, busy: true, saving: true }, 'saving'],
  [{ hasFile: false }, 'ready'],
  [{ hasFolder: false, hasFile: false }, 'chooseFolder'],
] as const)(
  'reports the current save state rather than just authorization: %j',
  (changes, kind) => {
    expect(driveSyncStatus({ ...saved, ...changes })).toBe(kind);
  },
);

it.each([
  ['synced', false, 'drive.synced', 'synced'],
  ['pending', false, 'drive.pendingSave', 'pending'],
  ['saving', false, 'drive.saving', 'saving'],
  ['restoring', false, 'drive.restoringConnection', 'saving'],
  ['checking', false, 'drive.checking', 'saving'],
  ['reconnect', false, 'drive.reconnectRequired', 'reconnect'],
  ['error', false, 'drive.syncError', 'error'],
  ['conflict', false, 'drive.syncConflict', 'error'],
  ['expiring', false, 'drive.connectionExpiring', 'expiring'],
  ['ready', false, 'drive.readySave', 'ready'],
  ['chooseFolder', false, 'drive.chooseSaveFolder', 'ready'],
  ['synced', true, 'drive.editing', 'pending'],
  ['chooseFolder', true, 'drive.editing', 'pending'],
  ['error', true, 'drive.syncError', 'error'],
  ['saving', true, 'drive.saving', 'saving'],
] as const)('shows %s (editing: %s) as %s', (kind, editing, label, tone) => {
  expect(syncPresentation(kind, editing)).toEqual({ label, tone });
});

it.each([
  [{ hasFolder: false }, null],
  [{ awaitingRestore: true, busy: true }, 'restoring'],
  [{ awaitingRestore: true }, 'reconnect'],
  [{ paused: true }, 'stopped'],
  [{ connected: false }, 'stopped'],
  [{ busy: true }, 'saving'],
  [{ dirty: true }, 'waiting'],
  [{ hasFile: false }, 'ready'],
  [{}, 'saved'],
] as const)('derives the autosave state as a kind, not a label: %j', (changes, state) => {
  expect(autoSaveState({ ...saved, ...changes })).toBe(state);
});
