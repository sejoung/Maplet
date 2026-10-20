import { useI18n } from '../i18n/react';
import { useRef } from 'react';
import { ArrowDownToLine, Check, Cloud, FilePlus2, FolderOpen, Settings } from 'lucide-react';
import { ToolbarMenu } from './ToolbarMenu';
import { DocumentName } from './DocumentName';

interface HeaderProps {
  filename: string;
  documentKey: number;
  onFilenameChange(name: string): void;
  dirty: boolean;
  original: string | null;
  driveConnected: boolean;
  driveBusy: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onSave(): void;
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
  const driveLabel = t(props.driveConnected ? 'Google Drive 연결됨' : 'Google Drive 연결');
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
        <button onClick={command(props.onSave)}>
          <ArrowDownToLine size={17} />
          {t('.maplet 저장')}
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
        <button
          className={`button drive-button${props.driveConnected ? ' connected' : ''}`}
          aria-haspopup="dialog"
          aria-label={driveLabel}
          title={driveLabel}
          disabled={props.driveBusy}
          onClick={command(props.onDrive)}
        >
          {props.driveConnected ? <Check size={16} /> : <Cloud size={16} />}
          <span className="drive-label-full">{driveLabel}</span>
          <span className="drive-label-short" aria-hidden="true">
            Google Drive
          </span>
        </button>
        <button
          className="button primary save-button"
          aria-label={t('.maplet 저장')}
          title={t('.maplet 저장')}
          onClick={props.onSave}
        >
          <ArrowDownToLine size={16} />
          <span>{t('.maplet 저장')}</span>
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
