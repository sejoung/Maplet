import { useCallback } from 'react';
import { driveSyncStatus } from '../application/drive-sync';
import { useLatest } from '../components/useLatest';
import type { DriveController } from './useDrive';

type DriveSaveState = Pick<
  DriveController,
  | 'busy'
  | 'connected'
  | 'expiring'
  | 'saveFolder'
  | 'awaitingRestore'
  | 'driveFile'
  | 'driveDirty'
  | 'activity'
  | 'autoSave'
  | 'saveDrive'
  | 'showDrive'
>;

/** The one Save command: to Drive once it is set up, otherwise a download. */
export function usePrimarySave(drive: DriveSaveState, download: () => void) {
  const latest = useLatest({ drive, download });
  const save = useCallback(() => {
    const { drive: target, download: fallback } = latest.current;
    // A running save queues this request behind it.
    if (target.busy) return void target.saveDrive();
    if (!target.connected && !target.saveFolder) return fallback();
    if (!target.connected || !target.saveFolder || target.awaitingRestore)
      return target.showDrive();
    if (target.driveFile && !target.driveDirty && target.autoSave === 'saved') return;
    void target.saveDrive();
  }, [latest]);
  const saveToDrive = Boolean(drive.connected || drive.saveFolder);
  return {
    save,
    saveToDrive,
    sync: saveToDrive
      ? driveSyncStatus({
          connected: drive.connected,
          expiring: drive.expiring,
          hasFolder: Boolean(drive.saveFolder),
          awaitingRestore: drive.awaitingRestore,
          busy: drive.busy,
          saving: drive.activity === 'saving',
          paused: drive.autoSave === 'stopped',
          conflict: drive.activity === 'conflict',
          dirty: drive.driveDirty,
          hasFile: Boolean(drive.driveFile),
        })
      : null,
  };
}
