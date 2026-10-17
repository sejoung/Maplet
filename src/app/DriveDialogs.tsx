import { Cloud, Download, FolderOpen } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import type { DriveController } from './useDrive';

export function DriveDialogs({ controller, save }: { controller: DriveController; save(): void }) {
  const {
    dialog,
    closeDialog,
    configured,
    content,
    busy,
    driveReady,
    connected,
    driveFile,
    driveSavedContent,
    driveStatus,
    connectDrive,
    openDrive,
    saveDrive,
    disconnect,
  } = controller;
  return (
    <>
      {dialog === 'drive' && (
        <Dialog title="Google Drive" onClose={closeDialog}>
          <div className="drive-intro">
            <Cloud size={28} />
            <p>
              <span className="muted">선택한 파일에만 접근하는 drive.file 권한을 사용합니다.</span>
            </p>
          </div>
          {!configured ? (
            <>
              <p>
                이 배포에는 Google 연결 설정이 아직 없습니다. 로컬 파일 열기·편집·저장 기능은 바로
                사용할 수 있습니다.
              </p>
              <button className="button primary" onClick={save}>
                <Download size={16} /> 로컬 파일 다운로드
              </button>
            </>
          ) : (
            <>
              <p role="status" className="drive-status">
                {driveFile &&
                driveSavedContent !== content &&
                !busy &&
                driveStatus === 'Drive에 저장됨'
                  ? 'Drive에 저장한 이후 편집한 변경이 있습니다'
                  : driveStatus}
              </p>
              <div className="drive-actions">
                <button
                  className="button primary"
                  disabled={busy || !driveReady}
                  onClick={() => void connectDrive()}
                >
                  {connected ? '다시 연결' : driveReady ? 'Google에 연결' : '연결 준비 중…'}
                </button>
                <button
                  className="button"
                  disabled={busy || !connected}
                  onClick={() => void openDrive()}
                >
                  <FolderOpen size={17} /> Drive에서 열기
                </button>
                <button
                  className="button"
                  disabled={busy || !connected}
                  onClick={() => void saveDrive()}
                >
                  Drive에 저장
                </button>
                <button
                  className="button"
                  disabled={busy || !connected}
                  onClick={() => void saveDrive('copy')}
                >
                  새 사본으로 저장
                </button>
                {connected && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      disconnect();
                    }}
                  >
                    연결 해제
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'conflict' && (
        <Dialog title="Drive 파일을 확인해 주세요." onClose={closeDialog}>
          <p>
            다른 곳에서 파일이 변경되었거나 버전 검증 정보를 얻지 못했습니다. 현재 편집과 로컬
            초안은 유지됩니다.
          </p>
          <div className="drive-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveDrive('copy')}
            >
              새 사본으로 저장
            </button>
            <button className="button" onClick={save}>
              로컬 파일 다운로드
            </button>
            <button
              className="button danger-quiet"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Drive의 현재 내용을 이 맵으로 덮어쓸까요?'))
                  void saveDrive('overwrite');
              }}
            >
              Drive 파일 덮어쓰기
            </button>
            <button className="button quiet" onClick={closeDialog}>
              편집으로 돌아가기
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
