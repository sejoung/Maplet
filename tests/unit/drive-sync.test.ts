import { expect, it } from 'vitest';
import { autoSaveState, driveSyncStatus } from '../../src/application/drive-sync';

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
  [{}, 'synced', 'drive.synced'],
  [{ dirty: true }, 'pending', 'drive.pendingSave'],
  [{ busy: true, saving: true, dirty: true }, 'saving', 'drive.saving'],
  [{ busy: true, awaitingRestore: true }, 'saving', 'drive.restoringConnection'],
  [{ busy: true }, 'saving', 'drive.checking'],
  [{ awaitingRestore: true }, 'reconnect', 'drive.reconnectRequired'],
  [{ connected: false }, 'reconnect', 'drive.reconnectRequired'],
  [{ paused: true, dirty: true }, 'error', 'drive.syncError'],
  [{ paused: true, conflict: true }, 'error', 'drive.syncConflict'],
  [{ expiring: true, dirty: true }, 'expiring', 'drive.connectionExpiring'],
  [{ expiring: true, paused: true }, 'error', 'drive.syncError'],
  [{ expiring: true, busy: true, saving: true }, 'saving', 'drive.saving'],
  [{ hasFile: false }, 'ready', 'drive.readySave'],
  [{ hasFolder: false, hasFile: false }, 'ready', 'drive.chooseSaveFolder'],
] as const)(
  'reports the current save state rather than just authorization: %j',
  (changes, kind, label) => {
    expect(driveSyncStatus({ ...saved, ...changes })).toEqual({ kind, label });
  },
);

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
