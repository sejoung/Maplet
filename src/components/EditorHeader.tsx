import { useI18n } from '../i18n/react';
import { useRef } from 'react';
import { ArrowDownToLine, CloudUpload, FilePlus2, FolderOpen, Settings } from 'lucide-react';
import { ToolbarMenu } from './ToolbarMenu';
import { DocumentName } from './DocumentName';
import { DriveConnectionButton } from './DriveConnectionButton';
import type { DriveSyncStatus } from '../application/drive-sync';

interface HeaderProps {
  filename: string;
  documentKey: number;
  onFilenameChange(name: string): void;
  dirty: boolean;
  original: string | null;
  driveConnected: boolean;
  driveBusy: boolean;
  driveSync: DriveSyncStatus | null;
  saveToDrive: boolean;
  editingText: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onSave(): void;
  onDownload(): void;
  onExportMup(): void;
  onBackup(): void;
  onDrive(): void;
  onSettings(): void;
  command(action: () => void): () => void;
}
export function EditorHeader(props: HeaderProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const { command } = props;
  const saveLabel = t(props.saveToDrive ? 'Drive에 저장' : '.maplet 저장');
  return (
    <header className="app-header">
      <h1 className="visually-hidden">{t('Maplet 마인드맵 편집기')}</h1>
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="25" height="25" alt="" />
        <span>Maplet</span>
      </div>
      <ToolbarMenu label={t('파일')}>
        <button onClick={command(props.onNew)}>
          <FilePlus2 size={17} />
          {t('새 맵')}
        </button>
        <button onClick={command(() => input.current?.click())}>
          <FolderOpen size={17} />
          {t('열기')}
        </button>
        <button onClick={command(props.onDownload)}>
          <ArrowDownToLine size={17} />
          {t('.maplet 다운로드')}
        </button>
        <button onClick={command(props.onExportMup)}>
          <ArrowDownToLine size={17} />
          {t('.mup 내보내기')}
        </button>
        {props.original && (
          <button onClick={command(props.onBackup)}>
            <ArrowDownToLine size={17} />
            {t('원본 백업 다운로드')}
          </button>
        )}
      </ToolbarMenu>
      <div className="document-name" title={props.filename}>
        <DocumentName
          key={props.documentKey}
          filename={props.filename}
          onChange={props.onFilenameChange}
        />
        {props.dirty && (
          <span className="unsaved-marker" aria-label={t('저장하지 않은 변경')}>
            •
          </span>
        )}
      </div>
      <div className="header-actions">
        <DriveConnectionButton
          connected={props.driveConnected}
          busy={props.driveBusy}
          sync={props.driveSync}
          editing={props.editingText}
          onClick={command(props.onDrive)}
        />
        <button
          className="button primary save-button"
          aria-label={saveLabel}
          title={`${saveLabel} (Ctrl/Cmd+S)`}
          disabled={props.saveToDrive && props.driveBusy}
          onClick={props.onSave}
        >
          {props.saveToDrive ? <CloudUpload size={16} /> : <ArrowDownToLine size={16} />}
          <span>{saveLabel}</span>
        </button>
        <button
          className="button settings-button"
          aria-label={t('설정')}
          title={t('설정')}
          aria-haspopup="dialog"
          onClick={command(props.onSettings)}
        >
          <Settings size={16} />
          <span>{t('설정')}</span>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".maplet,.mup,.json,application/json"
        aria-label={t('마인드맵 파일 열기')}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files?.[0]) props.onOpen(event.target.files[0]);
          event.target.value = '';
        }}
      />
    </header>
  );
}
