import { useCallback, useLayoutEffect, useRef } from 'react';
import type { DriveController } from './useDrive';
import { driveSyncStatus } from '../application/drive-sync';

export function usePrimarySave(drive: DriveController, download: () => void, documentKey: number) {
  const latest = useRef({ drive, download, documentKey });
  useLayoutEffect(() => {
    latest.current = { drive, download, documentKey };
  });
  const save = useCallback(() => {
    const current = latest.current;
    const target = current.drive;
    if (target.busy) {
      void target.saveDrive();
      return;
    }
    if (!target.connected && !target.saveFolder) return current.download();
    if (!target.connected || !target.saveFolder || target.awaitingRestore)
      return target.showDrive();
    if (target.driveFile && !target.driveDirty && target.autoSave === 'saved') return;
    void target.saveDrive();
  }, []);
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
