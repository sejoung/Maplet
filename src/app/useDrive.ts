import { useCallback, useState } from 'react';
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

interface DriveOptions {
  content: string;
  filename: string;
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

export function useDrive({ content, filename, allowReplace, replace, setNotice }: DriveOptions) {
  const [dialog, setDialog] = useState<'drive' | 'conflict' | null>(null);
  const [driveReady, setDriveReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [driveSavedContent, setDriveSavedContent] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState('연결하지 않음');
  const [driveError, setDriveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const fail = (reason: unknown) => {
    if (reason instanceof DriveAuthError || !google?.getToken()) setConnected(false);
    setDriveError(reason instanceof Error ? reason.message : 'Drive 작업을 완료하지 못했습니다.');
    setDialog('drive');
  };
  const openDrive = async () => {
    if (!google || !drive || busy || !driveReady || !allowReplace()) return;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      setDialog(null);
      const id = await google.pick();
      if (!id) {
        setDriveStatus('파일 선택을 취소했습니다.');
        setDialog('drive');
        return;
      }
      const file = await drive.open(id);
      const next = parseDocument(file.content);
      replace(next, nativeFilename(file.name));
      setDriveFile(file);
      setDriveSavedContent(serializeMaplet(next));
      setDriveStatus('Drive 파일을 열었습니다');
    } catch (reason) {
      fail(reason);
      setDriveStatus('열기 실패 · 로컬 파일 유지');
    } finally {
      setBusy(false);
    }
  };
  const saveDrive = async (mode: 'normal' | 'copy' | 'overwrite' = 'normal') => {
    if (!google || !drive || busy || !driveReady) return;
    setBusy(true);
    setDriveError(null);
    try {
      await authorize();
      const target = driveSaveTarget(filename, driveFile, mode === 'copy');
      let folderId: string | null = null;
      if (target.create) {
        setDialog(null);
        folderId = await google.pick('folder');
        if (!folderId) {
          setDriveStatus('저장 위치 선택을 취소했습니다.');
          setDialog('drive');
          return;
        }
      }
      setDriveStatus('Drive 저장 중…');
      const file = target.create
        ? await drive.create(target.name, content, folderId!)
        : await drive.save(driveFile!, content, mode === 'overwrite');
      setDriveFile(file);
      setDriveSavedContent(content);
      setDriveStatus('Drive에 저장됨');
      setNotice('Google Drive에 저장했습니다.');
      setDialog(null);
    } catch (reason) {
      if (
        reason instanceof DriveConflict ||
        (reason instanceof Error && reason.message.includes('검증'))
      ) {
        setDialog('conflict');
        setDriveStatus('충돌 · 로컬 초안 유지');
      } else {
        fail(reason);
        setDriveStatus('저장 실패 · 로컬 초안 유지');
      }
    } finally {
      setBusy(false);
    }
  };
  const closeDialog = useCallback(() => setDialog(null), []);
  const clearFile = () => setDriveFile(null);
  const disconnect = () => {
    google?.disconnect();
    setConnected(false);
    setDriveFile(null);
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
    driveError,
    showDrive,
    openDrive,
    saveDrive,
    disconnect,
    clearFile,
  };
}

export type DriveController = ReturnType<typeof useDrive>;
