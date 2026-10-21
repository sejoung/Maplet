import type { DriveSyncStatus } from '../application/drive-sync';
import type { Translatable } from '../i18n/core';
import type { CanvasProps } from './canvas-types';
import type { NodeToolActions } from './NodeToolsDialog';

export type EditorCanvasProps = Omit<CanvasProps, 'controlsRef' | 'onZoomChange'>;
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
}
interface DriveIndicators {
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
    FileActions,
    DriveIndicators,
    HistoryActions,
    StatusMessages {}
