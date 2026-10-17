import { useCallback, useState } from 'react';
import type { MindMap } from '../domain/model';
import { parseMup, serializeMup } from '../adapters/mup/codec';
import { DriveClient, DriveConflict, type DriveFile } from '../adapters/drive/client';
import { GoogleConnection, type GoogleConfig } from '../adapters/drive/google';

interface DriveOptions {
  content: string;
  filename: string;
  allowReplace(): boolean;
  replace(next: MindMap, name: string): void;
  report(reason: unknown): void;
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
  allowReplace,
  replace,
  report,
  setNotice,
}: DriveOptions) {
  const [dialog, setDialog] = useState<'drive' | 'conflict' | null>(null);
  const [driveReady, setDriveReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [driveSavedContent, setDriveSavedContent] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState('연결하지 않음');
  const [busy, setBusy] = useState(false);
  const showDrive = () => {
    setDialog('drive');
    if (google && !driveReady) {
      setBusy(true);
      google
        .prepare()
        .then(() => setDriveReady(true))
        .catch(report)
        .finally(() => setBusy(false));
    }
  };
  const connectDrive = async () => {
    if (!google) return;
    setBusy(true);
    try {
      await google.connect();
      setConnected(true);
      setDriveStatus('연결됨 · 파일을 선택해 주세요');
    } catch (reason) {
      report(reason);
      setConnected(false);
      setDriveStatus('연결 실패 · 로컬 파일 유지');
    } finally {
      setBusy(false);
    }
  };
  const openDrive = async () => {
    if (!google || !drive || !allowReplace()) return;
    setBusy(true);
    try {
      const id = await google.pick();
      if (id) {
        const file = await drive.open(id);
        const next = parseMup(file.content);
        replace(next, file.name);
        setDriveFile(file);
        setDriveSavedContent(serializeMup(next));
        setDriveStatus('Drive 파일을 열었습니다');
        setDialog(null);
      }
    } catch (reason) {
      report(reason);
      setDriveStatus('열기 실패 · 로컬 파일 유지');
    } finally {
      setBusy(false);
    }
  };
  const saveDrive = async (mode: 'normal' | 'copy' | 'overwrite' = 'normal') => {
    if (!drive) return;
    setBusy(true);
    setDriveStatus('Drive 저장 중…');
    try {
      const file =
        mode === 'copy' || !driveFile
          ? await drive.create(
              mode === 'copy' ? filename.replace(/\.mup$/i, '') + ' (사본).mup' : filename,
              content,
            )
          : await drive.save(driveFile, content, mode === 'overwrite');
      setDriveFile(file);
      setDriveSavedContent(content);
      setDriveStatus('Drive에 저장됨');
      setNotice('Drive에 저장했습니다. 로컬 파일 다운로드 상태는 별도로 유지합니다.');
      setDialog('drive');
    } catch (reason) {
      if (
        reason instanceof DriveConflict ||
        (reason instanceof Error && reason.message.includes('검증'))
      ) {
        setDialog('conflict');
        setDriveStatus('충돌 · 로컬 초안 유지');
      } else {
        report(reason);
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
  };
  return {
    dialog,
    closeDialog,
    configured: Boolean(google),
    content,
    busy,
    driveReady,
    connected,
    driveFile,
    driveSavedContent,
    driveStatus,
    showDrive,
    connectDrive,
    openDrive,
    saveDrive,
    disconnect,
    clearFile,
  };
}

export type DriveController = ReturnType<typeof useDrive>;
