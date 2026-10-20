import { useI18n } from '../i18n/react';
import { Cloud, Download, FolderOpen } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { driveSaveTarget } from '../adapters/documents';
import type { DriveController } from './useDrive';

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
                    ? '이전 저장 위치를 기억하고 있습니다. 다시 연결하면 이어서 작업할 수 있습니다.'
                    : saveFolder
                      ? '저장 폴더를 선택했습니다. 파일을 열거나 현재 맵을 저장하세요.'
                      : '먼저 자동 저장할 폴더를 선택한 뒤 파일을 열거나 현재 맵을 저장하세요.',
                )}
              </span>
            </p>
          </div>
          {!configured ? (
            <>
              <p>
                {t(
                  '이 배포에는 Google 연결 설정이 아직 없습니다. 로컬 파일 열기·편집·저장 기능은 바로 사용할 수 있습니다.',
                )}
              </p>
              <button className="button primary" onClick={save}>
                <Download size={16} />
                {t('로컬 파일 다운로드')}
              </button>
            </>
          ) : (
            <>
              {driveError && (
                <p className="form-error" role="alert">
                  {t(driveError)}
                </p>
              )}
              {(connected || busy) && (
                <p role="status" className="drive-status">
                  {!driveReady
                    ? t('Drive 준비 중…')
                    : busy
                      ? t('Drive 작업을 진행하고 있습니다…')
                      : driveFile && driveDirty && driveStatus === 'Drive에 저장됨'
                        ? t('Drive에 저장한 이후 편집한 변경이 있습니다')
                        : t(driveStatus)}
                </p>
              )}
              <div className="drive-setup-step">
                <p>
                  <strong>{t('1. 저장 폴더')}</strong>
                </p>
                <p className="drive-filename">
                  <FolderOpen size={17} aria-hidden="true" />{' '}
                  {saveFolder ? saveFolder.name : t('선택하지 않음')}
                </p>
                {rememberedFile && <p className="drive-filename">{rememberedFile.name}</p>}
                <div className="drive-actions">
                  {needsReconnect && (
                    <button
                      className="button primary"
                      disabled={busy || !driveReady}
                      onClick={() => void resumeDrive()}
                    >
                      {t('다시 연결')}
                    </button>
                  )}
                  <button
                    className={`button ${saveFolder ? '' : 'primary'}`}
                    disabled={busy || !driveReady}
                    onClick={() => void chooseSaveFolder()}
                  >
                    {saveFolder ? t('저장 폴더 변경') : t('저장 위치 선택')}
                  </button>
                </div>
                <p className="muted">
                  {t(
                    '내 드라이브에서 폴더를 찾아 선택하세요. 폴더 선택만으로 파일을 만들지 않습니다.',
                  )}
                </p>
              </div>
              <div className="drive-setup-step">
                <p>
                  <strong>{t('2. 파일 열기 또는 저장')}</strong>
                </p>
                {!saveFolder && <p className="muted">{t('저장 폴더를 먼저 선택해 주세요.')}</p>}
                <p className="drive-filename">
                  {t('저장할 파일:')} <strong>{target.name}</strong>
                </p>
                {driveFile && !target.create && (
                  <p className="muted">
                    {t('자동 저장 파일: {filename}', { filename: driveFile.name })}
                  </p>
                )}
                <p className="muted">
                  {t(
                    '다른 위치에서 연 파일은 선택한 폴더에 사본으로 저장합니다. 이 폴더의 .maplet 파일은 이어서 저장합니다.',
                  )}
                </p>
                <div className="drive-actions">
                  <button
                    className="button"
                    disabled={busy || !driveReady || !saveFolder || awaitingRestore}
                    onClick={() => void openDrive()}
                  >
                    <FolderOpen size={17} />
                    {t('Drive에서 열기')}
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || !driveReady || !saveFolder || awaitingRestore}
                    onClick={() => void saveDrive()}
                  >
                    {t('Drive에 저장')}
                  </button>
                  {driveFile && (
                    <button
                      className="button"
                      disabled={busy || !driveReady}
                      onClick={() => void saveDrive('copy')}
                    >
                      {t('다른 위치에 새 사본 저장')}
                    </button>
                  )}
                </div>
              </div>
              <div className="drive-actions">
                {!driveReady && !busy && (
                  <button className="button" onClick={showDrive}>
                    {t('다시 불러오기')}
                  </button>
                )}
                {(connected || saveFolder) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      disconnect();
                    }}
                  >
                    {t('연결 해제')}
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'conflict' && (
        <Dialog title={t('Drive 파일을 확인해 주세요.')} onClose={closeDialog}>
          <p>{t('다른 곳에서 파일이 변경되었습니다. 현재 편집과 로컬 초안은 유지됩니다.')}</p>
          <div className="drive-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveDrive('copy')}
            >
              {t('새 사본으로 저장')}
            </button>
            <button className="button" onClick={save}>
              {t('로컬 파일 다운로드')}
            </button>
            <button
              className="button danger-quiet"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('Drive의 현재 내용을 이 맵으로 덮어쓸까요?')))
                  void saveDrive('overwrite');
              }}
            >
              {t('Drive 파일 덮어쓰기')}
            </button>
            <button className="button quiet" onClick={closeDialog}>
              {t('편집으로 돌아가기')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
