import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { parseDocument, nativeFilename } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';
import { DriveConflict, DriveAuthError, type DriveClient } from '../adapters/drive/client';
import type { GoogleConfig, GoogleConnection } from '../adapters/drive/google';
import { parseDriveBaseline } from '../adapters/storage/drive-baseline';
import {
  AUTO_SAVE_LABELS,
  DRIVE_ACTIVITY,
  autoSaveState,
  type DriveActivity,
} from '../application/drive-sync';
import { messageOf, type Message } from '../domain/errors';
import { useI18n } from '../i18n/react';
import { useDriveWorkspace } from './useDriveWorkspace';
import { restoreDriveWorkspace, restoredSyncState } from './restoreDriveWorkspace';
import { useDriveSaving } from './useDriveSaving';
import { driveSaveHandlers } from './driveSaveHandlers';
import type { DriveBaseline } from './driveMerge';
import { useDriveStartup } from './useDriveStartup';
import { useDriveBaseline } from './useDriveBaseline';
import { driveDisconnect } from './driveDisconnect';
import * as connection from './driveConnection';
import type { DriveOptions } from './DriveOptions';

export interface DriveServices {
  config: GoogleConfig;
  google: GoogleConnection | null;
  drive: DriveClient | null;
}

export function useDrive(
  {
    content,
    filename,
    documentKey,
    restorationReady = false,
    hasLocalWork = false,
    markSaved,
    applyMerge,
    allowReplace,
    replace,
    setNotice,
  }: DriveOptions,
  { config, google, drive }: DriveServices = connection,
) {
  const { language, t } = useI18n();
  const [dialog, setDialog] = useState<'drive' | 'conflict' | null>(null);
  const [driveReady, setDriveReady] = useState(false);
  const [connected, setConnected] = useState(() => Boolean(google?.getToken()));
  const {
    saveFolder,
    setSaveFolder,
    driveFile,
    setDriveFile,
    setSourceFile,
    pending,
    setPending,
    draftWorkspace,
    restoreDraftWorkspace: restoreWorkspace,
  } = useDriveWorkspace(config.clientId);
  const synced = useDriveBaseline();
  const { baseline } = synced;
  const driveDirty = content !== synced.content || filename !== synced.filename;
  const [activity, setActivity] = useState<DriveActivity>('idle');
  const [driveError, setDriveError] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const latestDocument = useRef(documentKey);
  const latestWork = useRef({ content, filename, hasLocalWork });
  useLayoutEffect(() => {
    latestDocument.current = documentKey;
    latestWork.current = { content, filename, hasLocalWork };
  }, [documentKey, content, filename, hasLocalWork]);
  /** Run one exclusive Drive operation; results are dropped once a newer one starts. */
  const exclusive = async (
    run: (current: () => boolean) => Promise<void>,
    failed: (reason: unknown) => void,
  ) => {
    const operation = generation.current;
    const current = () => operation === generation.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      await run(current);
    } catch (reason) {
      if (current()) failed(reason);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const showDrive = () => {
    if (busy) return;
    setDialog('drive');
    if (google && !driveReady) {
      setBusy(true);
      google
        .prepare()
        .then(() => setDriveReady(true))
        .catch((reason) => setDriveError(messageOf(reason, 'Drive를 준비하지 못했습니다.')))
        .finally(() => setBusy(false));
    }
  };
  const authorize = async () => {
    if (!google) return;
    if (!connected || !google.getToken()) await google.connect();
    setConnected(true);
  };
  const fail = (reason: unknown, showDialog = true) => {
    if (reason instanceof DriveAuthError) google?.clearToken();
    if (reason instanceof DriveAuthError || !google?.getToken()) setConnected(false);
    setDriveError(messageOf(reason, 'Drive 작업을 완료하지 못했습니다.'));
    if (showDialog) setDialog('drive');
  };
  const resumeDrive = async (automatic = false) => {
    const workspace = pending?.workspace ?? draftWorkspace;
    if (!google || !drive || !workspace || busy || inFlight.current || (!automatic && !driveReady))
      return;
    const keepLocal = pending?.keepLocal ?? true;
    if (automatic && (!google.getToken() || (!keepLocal && hasLocalWork))) return;
    if (!automatic && !keepLocal && (workspace.file || workspace.source) && !allowReplace()) return;
    const savedDocument = documentKey;
    await exclusive(
      async (latest) => {
        const current = () =>
          latest() &&
          savedDocument === latestDocument.current &&
          (keepLocal ||
            (latestWork.current.hasLocalWork === hasLocalWork &&
              latestWork.current.content === content &&
              latestWork.current.filename === filename));
        try {
          if (!automatic) await authorize();
          if (!current()) return;
          const restored = await restoreDriveWorkspace(
            drive,
            workspace,
            keepLocal,
            content,
            baseline,
            filename,
          );
          if (!current()) return;
          if (!keepLocal && restored.document)
            replace(restored.document.map, restored.document.filename);
          if (keepLocal && restored.merged) applyMerge?.({ content, filename }, restored.merged);
          setSaveFolder(restored.folder);
          setDriveFile(restored.file);
          setSourceFile(restored.source);
          const next = restoredSyncState(restored, {
            keepLocal,
            remembered: Boolean(pending),
            content,
            filename,
            synced,
          });
          synced.set(next);
          if (keepLocal && restored.document?.content === content && filename === next.filename)
            markSaved(content);
          setPending(null);
          setAutoPaused(false);
          setActivity('reconnected');
          setDialog(null);
        } catch (reason) {
          // Superseded work must not report; a newer operation owns the dialog.
          if (current()) throw reason;
        }
      },
      (reason) => {
        setAutoPaused(true);
        if (reason instanceof DriveConflict) {
          saving.capture(reason);
          setDriveFile(workspace.file);
          setSourceFile(workspace.source);
          setPending(null);
          setDialog('conflict');
          setActivity('conflict');
        } else fail(reason, !automatic);
      },
    );
  };
  useDriveStartup(
    Boolean(
      restorationReady && pending && connected && !busy && (pending.keepLocal || !hasLocalWork),
    ),
    () => resumeDrive(true),
  );
  const chooseSaveFolder = async () => {
    if (!google || busy || inFlight.current || !driveReady) return;
    await exclusive(
      async (current) => {
        await authorize();
        if (!current()) return;
        setDialog(null);
        const folder = await google.pick('folder', language);
        if (!current()) return;
        if (folder) {
          if (folder.id !== saveFolder?.id || pending) {
            setDriveFile(null);
            setSourceFile(null);
            synced.reset(content, filename);
            setAutoPaused(false);
          }
          setSaveFolder(folder);
          setPending(null);
          setActivity('folderSelected');
        } else setActivity('folderCancelled');
        setDialog('drive');
      },
      (reason) => fail(reason),
    );
  };
  const openDrive = async () => {
    if (
      !google ||
      !drive ||
      !saveFolder ||
      pending ||
      busy ||
      inFlight.current ||
      !driveReady ||
      !allowReplace()
    )
      return;
    await exclusive(
      async (current) => {
        await authorize();
        if (!current()) return;
        setDialog(null);
        const selected = await google.pick('file', language);
        if (!current()) return;
        if (!selected) {
          setActivity('fileCancelled');
          setDialog('drive');
          return;
        }
        const file = await drive.open(selected.id);
        if (!current()) return;
        const next = parseDocument(file.content);
        replace(next, nativeFilename(file.name));
        setDriveFile(
          /\.maplet$/i.test(file.name) && file.parents?.includes(saveFolder.id) ? file : null,
        );
        setSourceFile(file);
        synced.adopt({ content: serializeMaplet(next), filename: nativeFilename(file.name) }, file);
        setActivity('opened');
        setAutoPaused(false);
      },
      (reason) => {
        fail(reason);
        setActivity('openFailed');
      },
    );
  };
  const saving = useDriveSaving({
    content,
    filename,
    documentKey,
    drive,
    folder: saveFolder,
    file: driveFile,
    baseline,
    busy,
    blocked: Boolean(pending),
    paused: autoPaused,
    dirty: driveDirty,
    autosave: Boolean(connected && !pending && !dialog && !autoPaused),
    inFlight,
    generation,
    copyLabel: t('사본'),
    authorize: async (automatic) => {
      if (automatic) {
        if (!google?.getToken()) throw new DriveAuthError();
      } else {
        if (!driveReady && !google?.getToken()) {
          showDrive();
          throw new DriveAuthError();
        }
        await authorize();
      }
    },
    pickFolder: async () => {
      if (!google) return null;
      await google.prepare();
      setDriveReady(true);
      setDialog(null);
      const folder = await google.pick('folder', language);
      if (!folder) {
        setActivity('folderCancelled');
        setDialog('drive');
      }
      return folder;
    },
    ...driveSaveHandlers({
      current: () => latestWork.current,
      setBusy,
      setDriveError,
      setActivity,
      setAutoPaused,
      setDialog,
      setDriveFile,
      setSourceFile,
      setSaveFolder,
      adopt: synced.adopt,
      applyMerge,
      markSaved,
      setNotice,
      fail,
    }),
  });
  const autoSave = autoSaveState({
    hasFolder: Boolean(saveFolder),
    awaitingRestore: Boolean(pending),
    busy,
    paused: autoPaused,
    connected,
    dirty: driveDirty,
    hasFile: Boolean(driveFile),
  });
  const closeDialog = useCallback(() => setDialog(null), []);
  const clearFile = (nextContent = content, nextFilename = filename) => {
    generation.current++;
    saving.clear();
    setDriveFile(null);
    setSourceFile(null);
    setPending(null);
    synced.reset(nextContent, nextFilename);
    setAutoPaused(false);
    setDriveError(null);
  };
  const disconnect = driveDisconnect(
    google,
    () => {
      setConnected(false);
      setSaveFolder(null);
      clearFile();
      setActivity('disconnected');
      setDriveError(null);
    },
    setBusy,
    setDriveError,
  );
  return {
    dialog,
    closeDialog,
    configured: Boolean(google),
    filename,
    busy,
    driveReady,
    connected,
    saveFolder,
    driveFile,
    rememberedFile: pending?.workspace.file ?? pending?.workspace.source ?? null,
    needsReconnect: Boolean(saveFolder && (pending || !connected)),
    awaitingRestore: Boolean(pending),
    draftWorkspace,
    restoreDraftWorkspace: (value: unknown, recoveredBaseline?: DriveBaseline | null) => {
      restoreWorkspace(value);
      synced.restoreBaseline(parseDriveBaseline(recoveredBaseline));
      saving.clear();
    },
    draftBaseline: baseline && saving.attempt ? { ...baseline, attempt: saving.attempt } : baseline,
    mergeConflict: saving.conflict,
    resolveConflict: saving.resolve,
    driveDirty,
    activity,
    driveStatus: DRIVE_ACTIVITY[activity],
    autoSave,
    autoSaveStatus: autoSave && AUTO_SAVE_LABELS[autoSave],
    driveError,
    showDrive,
    openDrive,
    chooseSaveFolder,
    resumeDrive,
    saveDrive: saving.save,
    disconnect,
    clearFile,
  };
}
export type DriveController = ReturnType<typeof useDrive>;
