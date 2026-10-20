import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MindMap } from '../domain/model';
import { parseDocument, nativeFilename, driveSaveTarget } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';
import { DriveClient, DriveConflict, DriveAuthError } from '../adapters/drive/client';
import { GoogleConnection, type GoogleConfig } from '../adapters/drive/google';
import { useI18n } from '../i18n/react';
import { useDriveWorkspace } from './useDriveWorkspace';
import { restoreDriveWorkspace } from './restoreDriveWorkspace';
import { saveDriveDocument } from './saveDriveDocument';

interface DriveOptions {
  content: string;
  filename: string;
  documentKey: number;
  markSaved(content: string, filename?: string): void;
  allowReplace(): boolean;
  replace(next: MindMap, name: string): void;
  setNotice(message: string): void;
}

const config: GoogleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
};
const google =
  config.clientId && config.apiKey && config.appId ? new GoogleConnection(config) : null;
const drive = google ? new DriveClient(google.getToken) : null;

export function useDrive({
  content,
  filename,
  documentKey,
  markSaved,
  allowReplace,
  replace,
  setNotice,
}: DriveOptions) {
  const { language, t } = useI18n();
  const [dialog, setDialog] = useState<'drive' | 'conflict' | null>(null);
  const [driveReady, setDriveReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const {
    saveFolder,
    setSaveFolder,
    driveFile,
    setDriveFile,
    setSourceFile,
    pending,
    setPending,
    draftWorkspace,
    restoreDraftWorkspace,
  } = useDriveWorkspace(config.clientId);
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
  useLayoutEffect(() => {
    latestDocument.current = documentKey;
  }, [documentKey]);
  const showDrive = () => {
    if (busy) return;
    setDialog('drive');
    if (google && !driveReady) {
      setBusy(true);
      setDriveError(null);
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
    if (reason instanceof DriveAuthError || !google?.getToken()) setConnected(false);
    setDriveError(reason instanceof Error ? reason.message : 'Drive 작업을 완료하지 못했습니다.');
    if (showDialog) setDialog('drive');
  };
  const resumeDrive = async () => {
    const workspace = pending?.workspace ?? draftWorkspace;
    if (!google || !drive || !workspace || busy || inFlight.current || !driveReady) return;
    const keepLocal = pending?.keepLocal ?? true;
    if (!keepLocal && (workspace.file || workspace.source) && !allowReplace()) return;
    const operation = generation.current,
      savedDocument = documentKey;
    const current = () =>
      operation === generation.current && savedDocument === latestDocument.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      if (!current()) return;
      const restored = await restoreDriveWorkspace(drive, workspace, keepLocal, content);
      if (!current()) return;
      if (!keepLocal && restored.document)
        replace(restored.document.map, restored.document.filename);
      setSaveFolder(restored.folder);
      setDriveFile(restored.file);
      setSourceFile(restored.source);
      let baseline: string | null = restored.document?.content ?? content;
      if (!restored.document && keepLocal)
        baseline = pending ? null : (driveSavedContent ?? content);
      setDriveSavedContent(baseline);
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
        setDriveFile(workspace.file);
        setSourceFile(workspace.source);
        setPending(null);
        setDialog('conflict');
        setDriveStatus('충돌 · 로컬 초안 유지');
      } else fail(reason);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
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
  const saveDrive = async (mode: 'normal' | 'copy' | 'overwrite' = 'normal', automatic = false) => {
    if (!google || !drive || !saveFolder || pending || busy || inFlight.current || !driveReady)
      return;
    const target = driveSaveTarget(filename, driveFile, mode === 'copy', t('사본'));
    if (automatic && (autoPaused || !driveDirty)) return;
    const operation = generation.current;
    const savedDocument = documentKey;
    const current = () =>
      operation === generation.current && savedDocument === latestDocument.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      if (automatic) {
        if (!google.getToken()) throw new DriveAuthError();
      } else await authorize();
      if (!current()) return;
      let folder = saveFolder;
      if (mode === 'copy') {
        setDialog(null);
        const selected = await google.pick('folder', language);
        if (!current()) return;
        if (!selected) {
          setDriveStatus('저장 위치 선택을 취소했습니다.');
          setDialog('drive');
          return;
        }
        folder = selected;
      }
      if (!current()) return;
      setDriveStatus('Drive 저장 중…');
      const file = await saveDriveDocument(
        drive,
        driveFile,
        target,
        content,
        folder.id,
        mode === 'overwrite',
      );
      if (!current()) return;
      setDriveFile(file);
      setSourceFile(file);
      setSaveFolder(folder);
      setDriveSavedContent(content);
      setDriveSavedFilename(target.name);
      if (target.name === filename) markSaved(content);
      else markSaved(content, target.name);
      setAutoPaused(false);
      setDriveStatus('Drive에 저장됨');
      if (!automatic) setNotice('Google Drive에 저장했습니다.');
      setDialog(null);
    } catch (reason) {
      if (!current()) return;
      setAutoPaused(true);
      if (reason instanceof DriveConflict) {
        setDialog('conflict');
        setDriveStatus('충돌 · 로컬 초안 유지');
      } else {
        fail(reason, !automatic);
        if (automatic)
          setNotice(
            'Drive 자동 저장이 중지되었습니다. Google Drive에서 다시 저장해 주세요. 로컬 초안은 유지됩니다.',
          );
        setDriveStatus('저장 실패 · 로컬 초안 유지');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const autoSave = useRef(() => {});
  useLayoutEffect(() => {
    autoSave.current = () => {
      void saveDrive('normal', true);
    };
  });
  useEffect(() => {
    if (
      !connected ||
      pending ||
      !driveReady ||
      busy ||
      dialog ||
      autoPaused ||
      !saveFolder ||
      !driveDirty
    )
      return;
    const timer = window.setTimeout(() => autoSave.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [
    connected,
    pending,
    driveReady,
    busy,
    dialog,
    autoPaused,
    driveFile,
    saveFolder,
    content,
    filename,
    driveDirty,
    driveSavedContent,
    documentKey,
  ]);
  const autoSaveStatus = !saveFolder
    ? null
    : pending
      ? 'Drive 다시 연결 필요'
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
    setDriveFile(null);
    setSourceFile(null);
    setPending(null);
    setDriveSavedContent(nextContent);
    setDriveSavedFilename(nextFilename);
    setAutoPaused(false);
    setDriveError(null);
  };
  const disconnect = () => {
    google?.disconnect();
    setConnected(false);
    setSaveFolder(null);
    clearFile();
    setDriveStatus('연결 해제됨');
    setDriveError(null);
  };
  return {
    dialog,
    closeDialog,
    configured: Boolean(google),
    content,
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
    restoreDraftWorkspace,
    driveSavedContent,
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
