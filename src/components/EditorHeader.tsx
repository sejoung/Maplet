import { useI18n } from '../i18n/react';
import { useRef } from 'react';
import {
  ArrowDownToLine,
  Cloud,
  CloudUpload,
  Copy,
  FilePlus2,
  FolderOpen,
  Image,
  Settings,
} from 'lucide-react';
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
  driveConfigured: boolean;
  driveConnected: boolean;
  driveBusy: boolean;
  driveSync: DriveSyncStatus | null;
  saveToDrive: boolean;
  canSaveCopy: boolean;
  editingText: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onOpenDrive(): void;
  onSave(): void;
  onSaveCopy(): void;
  onDownload(): void;
  onExportMup(): void;
  onBackup(): void;
  onExportImage(format: 'png' | 'svg'): void;
  onDrive(): void;
  onSettings(): void;
  command(action: () => void): () => void;
}
export function EditorHeader(props: HeaderProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const { command } = props;
  const download = t('.maplet 다운로드');
  return (
    <header className="app-header">
      <h1 className="visually-hidden">{t('Maplet 마인드맵 편집기')}</h1>
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="25" height="25" alt="" />
        <span>Maplet</span>
      </div>
      <ToolbarMenu label={t('파일')} className="file-menu">
        <button onClick={command(props.onNew)}>
          <FilePlus2 size={17} />
          {t('새 맵')}
        </button>
        <button onClick={command(() => input.current?.click())}>
          <FolderOpen size={17} />
          {t('열기')}
        </button>
        {props.driveConfigured && (
          <button onClick={command(props.onOpenDrive)}>
            <Cloud size={17} />
            {t('Drive에서 열기')}
          </button>
        )}
        {props.saveToDrive && (
          <>
            <hr />
            <button onClick={command(props.onSave)} aria-keyshortcuts="Control+S Meta+S">
              <CloudUpload size={17} />
              {t('지금 저장')}
              <kbd aria-hidden="true">Ctrl/⌘ S</kbd>
            </button>
            {props.canSaveCopy && (
              <button onClick={command(props.onSaveCopy)}>
                <Copy size={17} />
                {t('다른 위치에 사본 저장')}
              </button>
            )}
          </>
        )}
        <hr />
        <span className="menu-label" aria-hidden="true">
          {t('다운로드')}
        </span>
        <button onClick={command(props.onDownload)}>
          <ArrowDownToLine size={17} />
          {download}
        </button>
        <button onClick={command(props.onExportMup)}>
          <ArrowDownToLine size={17} />
          {t('.mup 다운로드 (MindMup 호환)')}
        </button>
        <button onClick={command(() => props.onExportImage('png'))}>
          <Image size={17} />
          {t('PNG 이미지 다운로드')}
        </button>
        <button onClick={command(() => props.onExportImage('svg'))}>
          <Image size={17} />
          {t('SVG 이미지 다운로드')}
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
        {props.driveConfigured && (
          <DriveConnectionButton
            connected={props.driveConnected}
            busy={props.driveBusy}
            sync={props.driveSync}
            editing={props.editingText}
            onClick={command(props.onDrive)}
            onRetry={props.onSave}
          />
        )}
        {!props.saveToDrive && (
          // Without Drive autosave, saving means downloading; it stands out only when needed.
          <button
            className={`button save-button${props.dirty ? ' primary' : ''}`}
            aria-label={download}
            title={`${download} (Ctrl/Cmd+S)`}
            onClick={props.onSave}
          >
            <ArrowDownToLine size={16} />
            <span>{t('다운로드')}</span>
          </button>
        )}
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
