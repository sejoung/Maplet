import { useI18n } from '../i18n/react';
import { manualPath } from '../i18n/locale';
import { useRef } from 'react';
import {
  ArrowDownToLine,
  BookOpen,
  Cloud,
  CloudUpload,
  Copy,
  FilePlus2,
  FileText,
  FolderOpen,
  Image,
  ListTree,
  Printer,
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
  onExportOutline(format: 'md' | 'opml'): void;
  onPrint(): void;
  onDrive(): void;
  onSettings(): void;
  command(action: () => void): () => void;
}
export function EditorHeader(props: HeaderProps) {
  const { t, language } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const { command } = props;
  const download = t('header.downloadMaplet');
  return (
    <header className="app-header">
      <h1 className="visually-hidden">{t('header.mapletMindMapEditor')}</h1>
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="25" height="25" alt="" />
        <span>Maplet</span>
      </div>
      <ToolbarMenu label={t('header.file')} className="file-menu">
        <button onClick={command(props.onNew)}>
          <FilePlus2 size={17} />
          {t('header.newMap')}
        </button>
        <button onClick={command(() => input.current?.click())}>
          <FolderOpen size={17} />
          {t('header.open')}
        </button>
        {props.driveConfigured && (
          <button onClick={command(props.onOpenDrive)}>
            <Cloud size={17} />
            {t('common.openDrive')}
          </button>
        )}
        {props.saveToDrive && (
          <>
            <hr />
            <button onClick={command(props.onSave)} aria-keyshortcuts="Control+S Meta+S">
              <CloudUpload size={17} />
              {t('header.saveNow')}
              <kbd aria-hidden="true">Ctrl/⌘ S</kbd>
            </button>
            {props.canSaveCopy && (
              <button onClick={command(props.onSaveCopy)}>
                <Copy size={17} />
                {t('header.saveCopyElsewhere')}
              </button>
            )}
          </>
        )}
        <hr />
        <span className="menu-label" aria-hidden="true">
          {t('header.download')}
        </span>
        <button onClick={command(props.onDownload)}>
          <ArrowDownToLine size={17} />
          {download}
        </button>
        <button onClick={command(props.onExportMup)}>
          <ArrowDownToLine size={17} />
          {t('header.downloadMupMindmupCompatible')}
        </button>
        <button onClick={command(() => props.onExportImage('png'))}>
          <Image size={17} />
          {t('header.downloadPngImage')}
        </button>
        <button onClick={command(() => props.onExportImage('svg'))}>
          <Image size={17} />
          {t('header.downloadSvgImage')}
        </button>
        <button onClick={command(() => props.onExportOutline('md'))}>
          <FileText size={17} />
          {t('header.downloadMarkdownMd')}
        </button>
        <button onClick={command(() => props.onExportOutline('opml'))}>
          <ListTree size={17} />
          {t('header.downloadOpmlOpml')}
        </button>
        <button onClick={command(props.onPrint)}>
          <Printer size={17} />
          {t('header.printSavePdf')}
        </button>
        {props.original && (
          <button onClick={command(props.onBackup)}>
            <ArrowDownToLine size={17} />
            {t('header.downloadOriginalBackup')}
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
          <span className="unsaved-marker" aria-label={t('common.unsavedChanges')}>
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
            <span>{t('header.download')}</span>
          </button>
        )}
        <a
          className="button settings-button guide-button"
          href={manualPath(language)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('header.userGuide')}
          title={t('header.userGuide')}
        >
          <BookOpen size={16} />
          <span>{t('header.userGuide')}</span>
        </a>
        <button
          className="button settings-button"
          aria-label={t('common.settings')}
          title={t('common.settings')}
          aria-haspopup="dialog"
          onClick={command(props.onSettings)}
        >
          <Settings size={16} />
          <span>{t('common.settings')}</span>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".maplet,.mup,.json,.md,.markdown,.opml,.txt,application/json"
        aria-label={t('header.openMindMapFile')}
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
