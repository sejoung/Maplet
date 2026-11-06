import { useI18n } from '../i18n/react';
import { manualPath } from '../i18n/locale';
import { useRef } from 'react';
import { ArrowDownToLine, BookOpen, Settings } from 'lucide-react';
import { ToolbarMenu } from './ToolbarMenu';
import { DocumentName } from './DocumentName';
import { DriveConnectionButton } from './DriveConnectionButton';
import { MenuItems } from './menu-actions';
import { fileActionGroups } from './file-actions';
import type { DriveIndicators, EditorCanvasProps, FileActions } from './editor-types';
import { SHORTCUTS, withShortcut } from './shortcuts';

export interface HeaderProps
  extends
    FileActions,
    Omit<DriveIndicators, 'driveSaveStatus'>,
    Pick<EditorCanvasProps, 'documentKey'> {
  /** The opened file's original text when it was converted on open. */
  original: string | null;
  /** A title or file-name editor has focus. */
  editingText: boolean;
  onSettings(): void;
}
export function EditorHeader(props: HeaderProps) {
  const { t, language } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const download = t('header.downloadMaplet');
  const fileGroups = fileActionGroups(
    { ...props, onPickFile: () => input.current?.click(), hasOriginal: Boolean(props.original) },
    t,
  );
  return (
    <header className="app-header">
      <h1 className="visually-hidden">{t('header.mapletMindMapEditor')}</h1>
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="25" height="25" alt="" />
        <span>Maplet</span>
      </div>
      <ToolbarMenu label={t('header.file')} className="file-menu">
        <MenuItems groups={fileGroups} />
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
            onClick={props.onDrive}
            onRetry={props.onSave}
            onRenew={props.onDriveRenew}
          />
        )}
        {!props.saveToDrive && (
          // Without Drive autosave, saving means downloading; it stands out only when needed.
          <button
            className={`button save-button${props.dirty ? ' primary' : ''}`}
            aria-label={download}
            title={withShortcut(download, SHORTCUTS.save, 'plain')}
            onClick={props.onSave}
          >
            <ArrowDownToLine size={16} />
            <span>{t('header.download')}</span>
          </button>
        )}
        <a
          className="button quiet header-secondary"
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
          className="button quiet header-secondary"
          aria-label={t('common.settings')}
          title={t('common.settings')}
          aria-haspopup="dialog"
          onClick={props.onSettings}
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
