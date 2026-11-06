import { useCallback, useMemo } from 'react';
import { driveSaveTarget } from '../adapters/formats';
import { isMapletSource } from '../adapters/maplet/codec';
import { DriveAuthError } from '../adapters/drive/client';
import type { GoogleConfig } from '../adapters/drive/google';
import type { DriveAuth, DriveFiles } from '../adapters/drive/types';
import { parseDriveBaseline } from '../adapters/storage/drive-baseline';
import { parseDriveWorkspace } from '../adapters/storage/drive-workspace';
import type { DriveBaseline } from '../domain/snapshot';
import { autoSaveState } from '../application/drive-sync';
import type { DriveDialogsProps } from '../components/DriveDialogs';
import { AUTO_SAVE_LABELS } from '../components/drive-labels';
import { useLatest } from '../components/useLatest';
import { useI18n } from '../i18n/react';
import { merge } from './driveRules';
import { driveSaveEvents } from './driveSaveEvents';
import type { DriveOptions } from './DriveOptions';
import { useAuthEvents } from './useAuthEvents';
import { useAuthRenewal } from './useAuthRenewal';
import { useDriveConnection } from './useDriveConnection';
import { useDriveOperation } from './useDriveOperation';
import { useDrivePicker } from './useDrivePicker';
import { useDriveRestore } from './useDriveRestore';
import { useDriveSaving } from './useDriveSaving';
import { useDriveWorkspace } from './useDriveWorkspace';
import * as connections from './driveConnection';

export interface DriveServices {
  config: GoogleConfig;
  google: DriveAuth | null;
  drive: DriveFiles | null;
}

/** Google Drive for the open document: connection, workspace, saving and the dialogs. */
export function useDrive(options: DriveOptions, services: DriveServices = connections) {
  const { config, google, drive } = services;
  const { content, filename, documentKey, tab, setNotice } = options;
  const { t } = useI18n();
  const operation = useDriveOperation();
  const { busy } = operation;
  const workspace = useDriveWorkspace(config.clientId, tab);
  const { state, dispatch } = workspace;
  const { folder: saveFolder, file: driveFile, pending, synced, paused, dialog } = state;
  const connection = useDriveConnection(google, operation, () => dispatch({ type: 'show' }));
  const { connected, ready } = connection;
  const driveDirty = content !== synced.content || filename !== synced.filename;
  const latest = useLatest({ content, filename });
  const showDrive = () => {
    if (busy) return;
    dispatch({ type: 'show' });
    connection.prepare();
  };
  const picker = useDrivePicker({ google, drive, options, state, dispatch, operation, connection });
  const saving = useDriveSaving({
    content,
    filename,
    documentKey,
    drive,
    folder: saveFolder,
    file: driveFile,
    baseline: synced.baseline,
    operation,
    blocked: Boolean(pending),
    paused,
    dirty: driveDirty,
    autosave: Boolean(connected && !pending && !dialog && !paused),
    copyLabel: t('common.copySuffix'),
    authorize: async (automatic) => {
      if (automatic) {
        if (!google?.getToken()) throw new DriveAuthError();
      } else {
        if (!ready && !google?.getToken()) {
          showDrive();
          throw new DriveAuthError();
        }
        await connection.authorize();
      }
    },
    pickFolder: picker.pickCopyFolder,
    events: driveSaveEvents({
      dispatch,
      current: () => latest.current,
      clearError: () => operation.setError(null),
      applyMerge: options.applyMerge,
      markSaved: options.markSaved,
      setNotice,
      fail: connection.fail,
    }),
  });
  const resumeDrive = useDriveRestore({
    google,
    drive,
    options,
    state,
    draftWorkspace: workspace.draftWorkspace,
    dispatch,
    operation,
    connection,
    capture: saving.capture,
  });
  /** Forget the Drive file, e.g. for a new or imported map; `local` counts as clean. */
  const clearFile = (nextContent = content, nextFilename = filename) => {
    operation.cancel();
    saving.clear();
    dispatch({ type: 'cleared', local: { content: nextContent, filename: nextFilename } });
    operation.setError(null);
  };
  const resetConnection = () => {
    connection.setConnected(false);
    operation.cancel();
    saving.clear();
    dispatch({ type: 'disconnected', local: { content, filename } });
    operation.setError(null);
  };
  useAuthEvents(google, (event) => {
    if (event === 'connected') connection.setConnected(true);
    else if (event === 'expired') connection.setConnected(false);
    else if (event === 'disconnected') resetConnection();
  });
  const renewal = useAuthRenewal(google, connected && !busy, setNotice);
  const autoSave = autoSaveState({
    hasFolder: Boolean(saveFolder),
    awaitingRestore: Boolean(pending),
    busy,
    paused,
    connected,
    dirty: driveDirty,
    hasFile: Boolean(driveFile),
  });
  const canOperate = ready && !busy;
  const canOpenOrSave = canOperate && Boolean(saveFolder) && !pending;
  const closeDialog = useCallback(() => dispatch({ type: 'close' }), [dispatch]);
  const conflict = saving.conflict;
  const titles = useMemo(() => conflict && merge.nodeTitles(conflict), [conflict]);
  const rememberedFile = pending?.workspace.file ?? pending?.workspace.source ?? null;
  const needsReconnect = Boolean(saveFolder && (pending || !connected));
  const target = driveSaveTarget(filename, driveFile, false);
  const disconnect = () => connection.disconnect(resetConnection);
  /** Open from Drive once a folder is set; until then the dialog leads there. */
  const openDrive = () => (canOpenOrSave ? picker.open() : showDrive());
  const dialogs: Omit<DriveDialogsProps, 'onDownload'> = {
    dialog,
    configured: Boolean(google),
    busy,
    ready,
    connected,
    canOperate,
    canOpenOrSave,
    needsReconnect,
    folderName: saveFolder?.name ?? null,
    rememberedName: rememberedFile?.name ?? null,
    targetName: target.name,
    autosaveName: driveFile && !target.create ? driveFile.name : null,
    hasFile: Boolean(driveFile),
    dirty: driveDirty,
    activity: state.activity,
    error: operation.error,
    conflict: conflict && titles && { conflicts: conflict.conflicts, titles },
    onClose: closeDialog,
    onRetry: showDrive,
    onReconnect: () => void resumeDrive(),
    onChooseFolder: () => void picker.chooseSaveFolder(),
    onOpen: () => void openDrive(),
    onSave: (mode) => void saving.save(mode),
    onDisconnect: () => void disconnect(),
    onResolve: saving.resolve,
  };
  return {
    dialog,
    closeDialog,
    configured: Boolean(google),
    busy,
    connected,
    expiring: connected && renewal.expiring,
    renewDrive: renewal.renew,
    saveFolder,
    driveFile,
    rememberedFile,
    awaitingRestore: Boolean(pending),
    driveDirty,
    activity: state.activity,
    autoSave,
    autoSaveStatus: autoSave && AUTO_SAVE_LABELS[autoSave],
    showDrive,
    openDrive,
    chooseSaveFolder: picker.chooseSaveFolder,
    resumeDrive,
    saveDrive: saving.save,
    disconnect,
    clearFile,
    /** What a device draft keeps of Drive, and how a recovered draft resumes it. */
    draft: {
      workspace: workspace.draftWorkspace,
      baseline:
        synced.baseline && saving.attempt
          ? { ...synced.baseline, attempt: saving.attempt }
          : synced.baseline,
      restore: (value: unknown, baseline?: DriveBaseline | null) => {
        dispatch({
          type: 'draftRestored',
          workspace: parseDriveWorkspace(value),
          baseline: parseDriveBaseline(baseline, isMapletSource),
        });
        saving.clear();
      },
    },
    dialogs,
  };
}
export type DriveController = ReturnType<typeof useDrive>;
