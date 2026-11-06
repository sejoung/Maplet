import { useEffect, useId, useRef, useState } from 'react';
import { Cloud, Download, FolderOpen } from 'lucide-react';
import type { DriveActivity } from '../application/drive-sync';
import type { Message } from '../domain/errors';
import type { MergeChoices, MergeConflict } from '../domain/merge';
import { useI18n } from '../i18n/react';
import { Dialog, DialogActions } from './Dialog';
import { DRIVE_ACTIVITY_LABELS } from './drive-labels';
import { DriveMergeDialog } from './DriveMergeDialog';

export interface DriveDialogsProps {
  dialog: 'drive' | 'conflict' | null;
  configured: boolean;
  busy: boolean;
  /** Google's scripts are loaded. */
  ready: boolean;
  connected: boolean;
  /** Drive is ready and no operation is running. */
  canOperate: boolean;
  /** As `canOperate`, with a save folder and no workspace waiting to be restored. */
  canOpenOrSave: boolean;
  needsReconnect: boolean;
  folderName: string | null;
  /** A remembered file that waits for reconnecting. */
  rememberedName: string | null;
  /** The name the next save writes. */
  targetName: string;
  /** The file autosave updates, when the next save updates one. */
  autosaveName: string | null;
  hasFile: boolean;
  dirty: boolean;
  activity: DriveActivity;
  error: Message | null;
  /** Property conflicts, each with the title of the node it concerns. */
  conflict: { conflicts: MergeConflict[]; titles: (string | null)[] } | null;
  onClose(): void;
  onRetry(): void;
  onReconnect(): void;
  onChooseFolder(): void;
  onOpen(): void;
  onSave(mode?: 'copy' | 'overwrite'): void;
  onDisconnect(): void;
  onResolve(choices: MergeChoices): void;
  onDownload(): void;
}

export function DriveDialogs(props: DriveDialogsProps) {
  const { t } = useI18n();
  const { dialog, busy, ready, canOperate, canOpenOrSave, folderName, onClose, onDownload } = props;
  const copy = () => props.onSave('copy');
  return (
    <>
      {dialog === 'drive' && (
        <Dialog title="Google Drive" onClose={onClose}>
          <div className="drive-intro">
            <Cloud size={28} />
            <p>
              <span className="muted">
                {t(
                  props.needsReconnect
                    ? 'drive.previousSaveLocationRememberedReconnect'
                    : folderName !== null
                      ? 'drive.saveFolderSelectedOpenFile'
                      : 'drive.chooseAutosaveFolderFirstThen',
                )}
              </span>
            </p>
          </div>
          {!props.configured ? (
            <>
              <p>{t('drive.googleDriveNotConfiguredApp')}</p>
              <button className="button primary" onClick={onDownload}>
                <Download size={16} />
                {t('drive.downloadLocalFile')}
              </button>
            </>
          ) : (
            <>
              <p className="muted">{t('drive.securityReconnectDriveAfterRefreshing')}</p>
              {props.error && (
                <p className="form-error" role="alert">
                  {t(props.error)}
                </p>
              )}
              {(props.connected || busy) && (
                <p role="status" className="drive-status">
                  {!ready
                    ? t('drive.preparingDrive')
                    : busy
                      ? t('drive.workingDrive')
                      : props.hasFile && props.dirty && props.activity === 'saved'
                        ? t('drive.haveChangesSinceLastDrive')
                        : t(DRIVE_ACTIVITY_LABELS[props.activity])}
                </p>
              )}
              <div className="drive-setup-step">
                <p>
                  <strong>{t('drive.stepSaveFolder')}</strong>
                </p>
                <p className="drive-filename">
                  <FolderOpen size={17} aria-hidden="true" /> {folderName ?? t('drive.notSelected')}
                </p>
                {props.rememberedName && <p className="drive-filename">{props.rememberedName}</p>}
                <div className="drive-actions">
                  {props.needsReconnect && (
                    <button
                      className="button primary"
                      disabled={!canOperate}
                      onClick={props.onReconnect}
                    >
                      {t('drive.reconnect')}
                    </button>
                  )}
                  <button
                    className={`button ${folderName !== null ? '' : 'primary'}`}
                    disabled={!canOperate}
                    onClick={props.onChooseFolder}
                  >
                    {folderName !== null
                      ? t('drive.changeSaveFolder')
                      : t('drive.chooseSaveFolder')}
                  </button>
                </div>
                <p className="muted">{t('drive.browseMyDriveChooseFolder')}</p>
              </div>
              <div className="drive-setup-step">
                <p>
                  <strong>{t('drive.stepOpenOrSave')}</strong>
                </p>
                {folderName === null && <p className="muted">{t('drive.chooseSaveFolderFirst')}</p>}
                <p className="drive-filename">
                  {t('drive.fileToSave')} <strong>{props.targetName}</strong>
                </p>
                {props.autosaveName && (
                  <p className="muted">
                    {t('drive.autosaveFile', { filename: props.autosaveName })}
                  </p>
                )}
                <p className="muted">{t('drive.filesOpenedElsewhereSavedCopies')}</p>
                <div className="drive-actions">
                  <button className="button" disabled={!canOpenOrSave} onClick={props.onOpen}>
                    <FolderOpen size={17} />
                    {t('common.openDrive')}
                  </button>
                  <button
                    className="button primary"
                    disabled={!canOpenOrSave}
                    onClick={() => props.onSave()}
                  >
                    {t('common.saveDrive')}
                  </button>
                  {props.hasFile && (
                    <button className="button" disabled={!canOperate} onClick={copy}>
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
                {!ready && !busy && (
                  <button className="button" onClick={props.onRetry}>
                    {t('drive.retryLoading')}
                  </button>
                )}
                {(props.connected || folderName !== null) && (
                  <button className="text-button" disabled={busy} onClick={props.onDisconnect}>
                    {t('drive.disconnect')}
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'conflict' && props.conflict && (
        <DriveMergeDialog
          conflicts={props.conflict.conflicts}
          titles={props.conflict.titles}
          busy={busy}
          resolve={props.onResolve}
          close={onClose}
          download={onDownload}
          copy={copy}
        />
      )}
      {dialog === 'conflict' && !props.conflict && (
        <ChangedElsewhereDialog
          busy={busy}
          close={onClose}
          download={onDownload}
          copy={copy}
          overwrite={() => props.onSave('overwrite')}
        />
      )}
    </>
  );
}

/** The Drive file changed and no property-level merge applies: pick how to keep this map. */
function ChangedElsewhereDialog({
  busy,
  close,
  download,
  copy,
  overwrite,
}: {
  busy: boolean;
  close(): void;
  download(): void;
  copy(): void;
  overwrite(): void;
}) {
  const { t } = useI18n();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const overwriteId = useId();
  const keepButton = useRef<HTMLButtonElement>(null);
  // The asking button is replaced, so focus moves to the safe answer.
  useEffect(() => {
    if (confirmOverwrite) keepButton.current?.focus();
  }, [confirmOverwrite]);
  return (
    <Dialog title={t('drive.checkDriveFile')} onClose={close}>
      <p>{t('drive.fileChangedElsewhereCurrentEdits')}</p>
      {confirmOverwrite ? (
        // Overwriting discards the other version, so it asks again in place.
        <div className="drive-confirm" role="group" aria-labelledby={overwriteId}>
          <p id={overwriteId}>{t('drive.overwriteCurrentDriveFileMap')}</p>
          <DialogActions
            onCancel={() => setConfirmOverwrite(false)}
            cancelRef={keepButton}
            submitLabel={t('drive.overwriteDriveFile')}
            danger
            disabled={busy}
            onSubmit={() => {
              setConfirmOverwrite(false);
              overwrite();
            }}
          />
        </div>
      ) : (
        <div className="drive-actions">
          <button className="button primary" disabled={busy} onClick={copy}>
            {t('drive.saveNewCopy')}
          </button>
          <button className="button" onClick={download}>
            {t('drive.downloadLocalFile')}
          </button>
          <button
            className="button danger-quiet"
            disabled={busy}
            onClick={() => setConfirmOverwrite(true)}
          >
            {t('drive.overwriteDriveFile')}
          </button>
          <button className="button quiet" onClick={close}>
            {t('drive.backEditing')}
          </button>
        </div>
      )}
    </Dialog>
  );
}
