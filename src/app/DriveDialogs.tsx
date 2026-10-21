import { useI18n } from '../i18n/react';
import { Cloud, Download, FolderOpen } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { driveSaveTarget } from '../adapters/documents';
import type { DriveController } from './useDrive';
import { DriveMergeDialog } from './DriveMergeDialog';

export function DriveDialogs({ controller, save }: { controller: DriveController; save(): void }) {
  const { t } = useI18n();
  const {
    dialog,
    closeDialog,
    configured,
    filename,
    busy,
    driveReady,
    connected,
    saveFolder,
    driveFile,
    rememberedFile,
    needsReconnect,
    awaitingRestore,
    driveDirty,
    activity,
    driveStatus,
    driveError,
    showDrive,
    openDrive,
    chooseSaveFolder,
    saveDrive,
    disconnect,
    resumeDrive,
  } = controller;
  const target = driveSaveTarget(filename, driveFile, false);
  return (
    <>
      {dialog === 'drive' && (
        <Dialog title="Google Drive" onClose={closeDialog}>
          <div className="drive-intro">
            <Cloud size={28} />
            <p>
              <span className="muted">
                {t(
                  needsReconnect
                    ? 'drive.previousSaveLocationRememberedReconnect'
                    : saveFolder
                      ? 'drive.saveFolderSelectedOpenFile'
                      : 'drive.chooseAutosaveFolderFirstThen',
                )}
              </span>
            </p>
          </div>
          {!configured ? (
            <>
              <p>{t('drive.googleDriveNotConfiguredApp')}</p>
              <button className="button primary" onClick={save}>
                <Download size={16} />
                {t('drive.downloadLocalFile')}
              </button>
            </>
          ) : (
            <>
              <p className="muted">{t('drive.securityReconnectDriveAfterRefreshing')}</p>
              {driveError && (
                <p className="form-error" role="alert">
                  {t(driveError)}
                </p>
              )}
              {(connected || busy) && (
                <p role="status" className="drive-status">
                  {!driveReady
                    ? t('drive.preparingDrive')
                    : busy
                      ? t('drive.workingDrive')
                      : driveFile && driveDirty && activity === 'saved'
                        ? t('drive.haveChangesSinceLastDrive')
                        : t(driveStatus)}
                </p>
              )}
              <div className="drive-setup-step">
                <p>
                  <strong>{t('drive.stepSaveFolder')}</strong>
                </p>
                <p className="drive-filename">
                  <FolderOpen size={17} aria-hidden="true" />{' '}
                  {saveFolder ? saveFolder.name : t('drive.notSelected')}
                </p>
                {rememberedFile && <p className="drive-filename">{rememberedFile.name}</p>}
                <div className="drive-actions">
                  {needsReconnect && (
                    <button
                      className="button primary"
                      disabled={busy || !driveReady}
                      onClick={() => void resumeDrive()}
                    >
                      {t('drive.reconnect')}
                    </button>
                  )}
                  <button
                    className={`button ${saveFolder ? '' : 'primary'}`}
                    disabled={busy || !driveReady}
                    onClick={() => void chooseSaveFolder()}
                  >
                    {saveFolder ? t('drive.changeSaveFolder') : t('drive.chooseSaveFolder')}
                  </button>
                </div>
                <p className="muted">{t('drive.browseMyDriveChooseFolder')}</p>
              </div>
              <div className="drive-setup-step">
                <p>
                  <strong>{t('drive.stepOpenOrSave')}</strong>
                </p>
                {!saveFolder && <p className="muted">{t('drive.chooseSaveFolderFirst')}</p>}
                <p className="drive-filename">
                  {t('drive.fileToSave')} <strong>{target.name}</strong>
                </p>
                {driveFile && !target.create && (
                  <p className="muted">{t('drive.autosaveFile', { filename: driveFile.name })}</p>
                )}
                <p className="muted">{t('drive.filesOpenedElsewhereSavedCopies')}</p>
                <div className="drive-actions">
                  <button
                    className="button"
                    disabled={busy || !driveReady || !saveFolder || awaitingRestore}
                    onClick={() => void openDrive()}
                  >
                    <FolderOpen size={17} />
                    {t('common.openDrive')}
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || !driveReady || !saveFolder || awaitingRestore}
                    onClick={() => void saveDrive()}
                  >
                    {t('common.saveDrive')}
                  </button>
                  {driveFile && (
                    <button
                      className="button"
                      disabled={busy || !driveReady}
                      onClick={() => void saveDrive('copy')}
                    >
                      {t('drive.saveCopyAnotherFolder')}
                    </button>
                  )}
                </div>
              </div>
              <div className="drive-actions">
                <a
                  className="text-button"
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('drive.manageGoogleAccountAppPermissions')}
                </a>
                {!driveReady && !busy && (
                  <button className="button" onClick={showDrive}>
                    {t('drive.retryLoading')}
                  </button>
                )}
                {(connected || saveFolder) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      void disconnect();
                    }}
                  >
                    {t('drive.disconnect')}
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'conflict' && controller.mergeConflict && (
        <DriveMergeDialog
          conflict={controller.mergeConflict}
          busy={busy}
          resolve={controller.resolveConflict}
          close={closeDialog}
          download={save}
          copy={() => void saveDrive('copy')}
        />
      )}
      {dialog === 'conflict' && !controller.mergeConflict && (
        <Dialog title={t('drive.checkDriveFile')} onClose={closeDialog}>
          <p>{t('drive.fileChangedElsewhereCurrentEdits')}</p>
          <div className="drive-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveDrive('copy')}
            >
              {t('drive.saveNewCopy')}
            </button>
            <button className="button" onClick={save}>
              {t('drive.downloadLocalFile')}
            </button>
            <button
              className="button danger-quiet"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('drive.overwriteCurrentDriveFileMap')))
                  void saveDrive('overwrite');
              }}
            >
              {t('drive.overwriteDriveFile')}
            </button>
            <button className="button quiet" onClick={closeDialog}>
              {t('drive.backEditing')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
