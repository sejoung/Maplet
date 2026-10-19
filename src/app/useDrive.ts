import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MindMap } from '../domain/model';
import { parseDocument, nativeFilename, driveSaveTarget } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';
import {
  DriveClient,
  DriveConflict,
  DriveAuthError,
  type DriveFile,
} from '../adapters/drive/client';
import { GoogleConnection, type GoogleConfig } from '../adapters/drive/google';
import { useI18n } from '../i18n/react';

interface DriveOptions {
  content: string;
  filename: string;
  documentKey: number;
  markSaved(content: string): void;
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
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [driveSavedContent, setDriveSavedContent] = useState<string | null>(null);
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
  const openDrive = async () => {
    if (!google || !drive || busy || inFlight.current || !driveReady || !allowReplace()) return;
    const operation = generation.current;
    inFlight.current = true;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      if (operation !== generation.current) return;
      setDialog(null);
      const id = await google.pick('file', language);
      if (operation !== generation.current) return;
      if (!id) {
        setDriveStatus('파일 선택을 취소했습니다.');
        setDialog('drive');
        return;
      }
      const file = await drive.open(id);
      if (operation !== generation.current) return;
      const next = parseDocument(file.content);
      replace(next, nativeFilename(file.name));
      setDriveFile(file);
      setDriveSavedContent(serializeMaplet(next));
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
    if (!google || !drive || busy || inFlight.current || !driveReady) return;
    const target = driveSaveTarget(filename, driveFile, mode === 'copy', t('사본'));
    if (automatic && (target.create || autoPaused || content === driveSavedContent)) return;
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
      let folderId: string | null = null;
      if (target.create) {
        setDialog(null);
        folderId = await google.pick('folder', language);
        if (!current()) return;
        if (!folderId) {
          setDriveStatus('저장 위치 선택을 취소했습니다.');
          setDialog('drive');
          return;
        }
      }
      if (!current()) return;
      setDriveStatus('Drive 저장 중…');
      const file = target.create
        ? await drive.create(target.name, content, folderId!)
        : await drive.save(driveFile!, content, mode === 'overwrite');
      if (!current()) return;
      setDriveFile(file);
      setDriveSavedContent(content);
      markSaved(content);
      setAutoPaused(false);
      setDriveStatus('Drive에 저장됨');
      if (!automatic) setNotice('Google Drive에 저장했습니다.');
      setDialog(null);
    } catch (reason) {
      if (!current()) return;
      setAutoPaused(true);
      if (
        reason instanceof DriveConflict ||
        (reason instanceof Error && reason.message.includes('검증'))
      ) {
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
      !driveReady ||
      busy ||
      dialog ||
      autoPaused ||
      !driveFile ||
      !/\.maplet$/i.test(driveFile.name) ||
      content === driveSavedContent
    )
      return;
    const timer = window.setTimeout(() => autoSave.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [
    connected,
    driveReady,
    busy,
    dialog,
    autoPaused,
    driveFile,
    content,
    driveSavedContent,
    documentKey,
  ]);
  const autoSaveStatus = !driveFile
    ? null
    : !/\.maplet$/i.test(driveFile.name)
      ? '.maplet 저장 후 자동 저장됩니다'
      : autoPaused || !connected
        ? 'Drive 자동 저장 중지'
        : busy
          ? 'Drive 저장 중…'
          : content !== driveSavedContent
            ? 'Drive 저장 대기 중…'
            : 'Drive에 저장됨';
  const closeDialog = useCallback(() => setDialog(null), []);
  const clearFile = () => {
    generation.current++;
    setDriveFile(null);
    setDriveSavedContent(null);
    setAutoPaused(false);
    setDriveError(null);
  };
  const disconnect = () => {
    google?.disconnect();
    setConnected(false);
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
    driveFile,
    driveSavedContent,
    driveStatus,
    autoSaveStatus,
    driveError,
    showDrive,
    openDrive,
    saveDrive,
    disconnect,
    clearFile,
  };
}

export type DriveController = ReturnType<typeof useDrive>;
