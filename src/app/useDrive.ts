import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { parseDocument, nativeFilename } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';
import { DriveConflict, DriveAuthError } from '../adapters/drive/client';
import { useI18n } from '../i18n/react';
import { useDriveWorkspace } from './useDriveWorkspace';
import { restoreDriveWorkspace } from './restoreDriveWorkspace';
import { useDriveSaving } from './useDriveSaving';
import { driveSaveHandlers } from './driveSaveHandlers';
import { type DriveBaseline } from './driveMerge';
import { useDriveAutosave } from './useDriveAutosave';
import { useDriveStartup } from './useDriveStartup';
import { parseDriveBaseline } from '../adapters/storage/drive-baseline';
import { driveDisconnect } from './driveDisconnect';
import { config, google, drive } from './driveConnection';
import type { DriveOptions } from './DriveOptions';
export function useDrive({
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
}: DriveOptions) {
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
  const [baseline, setBaseline] = useState<DriveBaseline | null>(null);
  const [driveSavedContent, setDriveSavedContent] = useState<string | null>(null);
  const [driveSavedFilename, setDriveSavedFilename] = useState<string | null>(null);
  const driveDirty = content !== driveSavedContent || filename !== driveSavedFilename;
  const [driveStatus, setDriveStatus] = useState('연결하지 않음');
  const [driveError, setDriveError] = useState<string | null>(null);
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
  const showDrive = () => {
    if (busy) return;
    setDialog('drive');
    if (google && !driveReady) {
      setBusy(true);
      google
        .prepare()
        .then(() => setDriveReady(true))
        .catch((reason) => {
          setDriveError(reason instanceof Error ? reason.message : 'Drive를 준비하지 못했습니다.');
        })
        .finally(() => setBusy(false));
    }
  };
  const authorize = async () => {
    if (!google) return;
    if (!connected || !google.getToken()) {
      await google.connect();
    }
    setConnected(true);
  };
  const fail = (reason: unknown, showDialog = true) => {
    if (reason instanceof DriveAuthError) google?.clearToken();
    if (reason instanceof DriveAuthError || !google?.getToken()) setConnected(false);
    setDriveError(reason instanceof Error ? reason.message : 'Drive 작업을 완료하지 못했습니다.');
    if (showDialog) setDialog('drive');
  };
  const resumeDrive = async (automatic = false) => {
    const workspace = pending?.workspace ?? draftWorkspace;
    if (!google || !drive || !workspace || busy || inFlight.current || (!automatic && !driveReady))
      return;
    const keepLocal = pending?.keepLocal ?? true;
    if (automatic && (!google.getToken() || (!keepLocal && hasLocalWork))) return;
    if (!automatic && !keepLocal && (workspace.file || workspace.source) && !allowReplace()) return;
    const operation = generation.current,
      savedDocument = documentKey;
    const current = () =>
      operation === generation.current &&
      savedDocument === latestDocument.current &&
      (keepLocal ||
        (latestWork.current.hasLocalWork === hasLocalWork &&
          latestWork.current.content === content &&
          latestWork.current.filename === filename));
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
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
      let savedContent: string | null = restored.document?.content ?? content;
      if (!restored.document && keepLocal)
        savedContent = pending ? null : (driveSavedContent ?? content);
      setBaseline(
        restored.file && restored.document
          ? {
              fileId: restored.file.id,
              version: restored.file.version,
              content: restored.document.content,
              filename: restored.document.filename,
            }
          : null,
      );
      setDriveSavedContent(savedContent);
      const restoredName =
        restored.document?.filename ??
        (keepLocal && !pending ? (driveSavedFilename ?? filename) : filename);
      setDriveSavedFilename(restoredName);
      if (keepLocal && restored.document?.content === content && filename === restoredName)
        markSaved(content);
      setPending(null);
      setAutoPaused(false);
      setDriveStatus('저장 위치와 파일을 다시 연결했습니다.');
      setDialog(null);
    } catch (reason) {
      if (!current()) return;
      setAutoPaused(true);
      if (reason instanceof DriveConflict) {
        saving.capture(reason);
        setDriveFile(workspace.file);
        setSourceFile(workspace.source);
        setPending(null);
        setDialog('conflict');
        setDriveStatus('충돌 · 현재 편집 유지');
      } else fail(reason, !automatic);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  useDriveStartup(
    Boolean(
      restorationReady && pending && connected && !busy && (pending.keepLocal || !hasLocalWork),
    ),
    () => resumeDrive(true),
  );
  const chooseSaveFolder = async () => {
    if (!google || busy || inFlight.current || !driveReady) return;
    const operation = generation.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      if (operation !== generation.current) return;
      setDialog(null);
      const folder = await google.pick('folder', language);
      if (operation !== generation.current) return;
      if (folder) {
        if (folder.id !== saveFolder?.id || pending) {
          setDriveFile(null);
          setBaseline(null);
          setSourceFile(null);
          setDriveSavedContent(content);
          setDriveSavedFilename(filename);
          setAutoPaused(false);
        }
        setSaveFolder(folder);
        setPending(null);
        setDriveStatus('저장 폴더를 선택했습니다. 파일을 열거나 현재 맵을 저장하세요.');
      } else setDriveStatus('저장 위치 선택을 취소했습니다.');
      setDialog('drive');
    } catch (reason) {
      if (operation === generation.current) fail(reason);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
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
    const operation = generation.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      if (operation !== generation.current) return;
      setDialog(null);
      const selected = await google.pick('file', language);
      if (operation !== generation.current) return;
      if (!selected) {
        setDriveStatus('파일 선택을 취소했습니다.');
        setDialog('drive');
        return;
      }
      const file = await drive.open(selected.id);
      if (operation !== generation.current) return;
      const next = parseDocument(file.content);
      replace(next, nativeFilename(file.name));
      setDriveFile(
        /\.maplet$/i.test(file.name) && file.parents?.includes(saveFolder.id) ? file : null,
      );
      setSourceFile(file);
      setBaseline({
        fileId: file.id,
        version: file.version,
        content: serializeMaplet(next),
        filename: nativeFilename(file.name),
      });
      setDriveSavedContent(serializeMaplet(next));
      setDriveSavedFilename(nativeFilename(file.name));
      setDriveStatus('Drive 파일을 열었습니다');
      setAutoPaused(false);
    } catch (reason) {
      if (operation !== generation.current) return;
      fail(reason);
      setDriveStatus('열기 실패 · 로컬 파일 유지');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
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
        setDriveStatus('저장 위치 선택을 취소했습니다.');
        setDialog('drive');
      }
      return folder;
    },
    ...driveSaveHandlers({
      current: () => latestWork.current,
      setBusy,
      setDriveError,
      setDriveStatus,
      setAutoPaused,
      setDialog,
      setDriveFile,
      setSourceFile,
      setSaveFolder,
      setBaseline,
      setDriveSavedContent,
      setDriveSavedFilename,
      applyMerge,
      markSaved,
      setNotice,
      fail,
    }),
  });
  const saveDrive = saving.save;
  useDriveAutosave(
    Boolean(connected && !pending && !busy && !dialog && !autoPaused && saveFolder && driveDirty),
    () => {
      void saveDrive('normal', true);
    },
    content,
    filename,
    documentKey,
  );
  const autoSaveStatus = !saveFolder
    ? null
    : pending
      ? busy
        ? 'Drive 연결 복원 중…'
        : 'Drive 다시 연결 필요'
      : autoPaused || !connected
        ? 'Drive 자동 저장 중지'
        : busy
          ? 'Drive 저장 중…'
          : driveDirty
            ? 'Drive 저장 대기 중…'
            : !driveFile
              ? '편집하면 선택한 폴더에 자동 저장됩니다'
              : 'Drive에 저장됨';
  const closeDialog = useCallback(() => setDialog(null), []);
  const clearFile = (nextContent = content, nextFilename = filename) => {
    generation.current++;
    saving.clear();
    setBaseline(null);
    setDriveFile(null);
    setSourceFile(null);
    setPending(null);
    setDriveSavedContent(nextContent);
    setDriveSavedFilename(nextFilename);
    setAutoPaused(false);
    setDriveError(null);
  };
  const disconnect = driveDisconnect(
    google,
    () => {
      setConnected(false);
      setSaveFolder(null);
      clearFile();
      setDriveStatus('연결 해제됨');
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
      setBaseline(parseDriveBaseline(recoveredBaseline));
      saving.clear();
    },
    draftBaseline: baseline && saving.attempt ? { ...baseline, attempt: saving.attempt } : baseline,
    mergeConflict: saving.conflict,
    resolveConflict: saving.resolve,
    driveDirty,
    driveStatus,
    autoSaveStatus,
    driveError,
    showDrive,
    openDrive,
    chooseSaveFolder,
    resumeDrive,
    saveDrive,
    disconnect,
    clearFile,
  };
}
export type DriveController = ReturnType<typeof useDrive>;
