import type { DriveSyncStatus } from '../application/drive-sync';
import type { Translatable } from '../i18n/core';
import type { CanvasProps } from './canvas-types';
import type { NodeToolActions } from './NodeToolsDialog';

export type EditorCanvasProps = Omit<
  CanvasProps,
  | 'controlsRef'
  | 'onZoomChange'
  | 'onContextMenu'
  | 'onCanvasMenu'
  | 'onCopy'
  | 'onCut'
  | 'onPaste'
  | 'onDuplicate'
  | 'onReorder'
>;
interface ClipboardActions {
  /** Each returns the plain-text outline handed to other apps, or null when nothing was copied. */
  onCopyNode(id: string): string | null;
  onCutNode(id: string): string | null;
  /** Pastes `text` from another app, or this editor's last copied branch when omitted. */
  onPasteNode(id: string, text?: string): void;
  onDuplicateNode(id: string): void;
  onReorder(id: string, offset: -1 | 1): void;
  canPaste: boolean;
}
interface FileActions {
  filename: string;
  onFilenameChange(name: string): void;
  dirty: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onSave(): void;
  onDownload(): void;
  onExportMup(): void;
  onBackup(): void;
  onExportImage(format: 'png' | 'svg'): void;
}
interface DriveIndicators {
  driveConfigured: boolean;
  onOpenDrive(): void;
  onSaveCopy(): void;
  canSaveCopy: boolean;
  saveToDrive: boolean;
  driveSync: DriveSyncStatus | null;
  onDrive(): void;
  driveConnected: boolean;
  driveBusy: boolean;
  driveSaveStatus: string | null;
}
interface HistoryActions {
  onAutoLayout(): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onHelp(): void;
}
interface StatusMessages {
  draftStatus: string;
  error: Translatable | null;
  notice: Translatable | null;
  onDismissError(): void;
  onDismissNotice(): void;
  draftPrivacy?: { enabled: boolean; busy: boolean; change(enabled: boolean): void };
}
export interface EditorProps
  extends
    EditorCanvasProps,
    NodeToolActions,
    ClipboardActions,
    FileActions,
    DriveIndicators,
    HistoryActions,
    StatusMessages {}
