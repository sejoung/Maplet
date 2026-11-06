import {
  ArrowDownToLine,
  Cloud,
  CloudUpload,
  Copy,
  FilePlus2,
  FileText,
  FolderOpen,
  Image,
  ListTree,
  Printer,
} from 'lucide-react';
import type { MenuAction, MenuGroup } from './menu-actions';
import type { DriveIndicators, FileActions } from '../editor/editor-types';
import { SHORTCUTS } from './shortcuts';

export type FileActionHandlers = Pick<
  FileActions,
  | 'onNew'
  | 'onSave'
  | 'onDownload'
  | 'onExportMup'
  | 'onBackup'
  | 'onExportImage'
  | 'onExportOutline'
  | 'onPrint'
> &
  Pick<
    DriveIndicators,
    'driveConfigured' | 'onOpenDrive' | 'saveToDrive' | 'onSaveCopy' | 'canSaveCopy'
  > & {
    /** Opens the browser's file picker. */
    onPickFile(): void;
    /** The opened file was converted, so its exact original can be downloaded. */
    hasOriginal: boolean;
  };

/** The header's File menu: open, save to Drive when it autosaves, and every download. */
export function fileActionGroups(
  handlers: FileActionHandlers,
  t: (message: string) => string,
): MenuGroup[] {
  const when = (condition: boolean, action: MenuAction) => (condition ? [action] : []);
  const open: MenuAction[] = [
    { id: 'new', label: t('header.newMap'), icon: FilePlus2, run: handlers.onNew },
    { id: 'open', label: t('header.open'), icon: FolderOpen, run: handlers.onPickFile },
    ...when(handlers.driveConfigured, {
      id: 'openDrive',
      label: t('common.openDrive'),
      icon: Cloud,
      run: handlers.onOpenDrive,
    }),
  ];
  const save: MenuAction[] = [
    {
      id: 'save',
      label: t('header.saveNow'),
      icon: CloudUpload,
      shortcut: SHORTCUTS.save,
      run: handlers.onSave,
    },
    ...when(handlers.canSaveCopy, {
      id: 'saveCopy',
      label: t('header.saveCopyElsewhere'),
      icon: Copy,
      run: handlers.onSaveCopy,
    }),
  ];
  const download: MenuAction[] = [
    {
      id: 'download',
      label: t('header.downloadMaplet'),
      icon: ArrowDownToLine,
      run: handlers.onDownload,
    },
    {
      id: 'mup',
      label: t('header.downloadMupMindmupCompatible'),
      icon: ArrowDownToLine,
      run: handlers.onExportMup,
    },
    {
      id: 'png',
      label: t('header.downloadPngImage'),
      icon: Image,
      run: () => handlers.onExportImage('png'),
    },
    {
      id: 'svg',
      label: t('header.downloadSvgImage'),
      icon: Image,
      run: () => handlers.onExportImage('svg'),
    },
    {
      id: 'markdown',
      label: t('header.downloadMarkdownMd'),
      icon: FileText,
      run: () => handlers.onExportOutline('md'),
    },
    {
      id: 'opml',
      label: t('header.downloadOpmlOpml'),
      icon: ListTree,
      run: () => handlers.onExportOutline('opml'),
    },
    { id: 'print', label: t('header.printSavePdf'), icon: Printer, run: handlers.onPrint },
    ...when(handlers.hasOriginal, {
      id: 'backup',
      label: t('header.downloadOriginalBackup'),
      icon: ArrowDownToLine,
      run: handlers.onBackup,
    }),
  ];
  return [
    open,
    // Without Drive autosave, saving is downloading, which the header button offers.
    ...(handlers.saveToDrive ? [save] : []),
    { heading: t('header.download'), actions: download },
  ];
}
