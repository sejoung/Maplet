import type { DriveSyncKind } from '../../application/drive-sync';
import type { Translatable } from '../../i18n/core';
import type { CanvasProps } from '../canvas/canvas-types';
import type { NodePosition } from '../../domain/model';
import type { NodeToolActions } from '../dialogs/node-tools/NodeToolsDialog';

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
  | 'focusId'
  | 'matches'
  | 'minimap'
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
export interface FileActions {
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
  onExportOutline(format: 'md' | 'opml'): void;
  onPrint(): void;
}
export interface DriveIndicators {
  driveConfigured: boolean;
  onOpenDrive(): void;
  onSaveCopy(): void;
  canSaveCopy: boolean;
  saveToDrive: boolean;
  driveSync: DriveSyncKind | null;
  onDrive(): void;
  onDriveRenew(): void;
  driveConnected: boolean;
  driveBusy: boolean;
  driveSaveStatus: string | null;
}
interface StructureActions {
  /** A new central topic, at a map position when given. */
  onAddRoot(at?: NodePosition): void;
  /** Collapse below `depth` levels (null expands all), within `under` when given. */
  onShowLevels(depth: number | null, under?: string): void;
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
  /** A deletion that removed several nodes, with an undo shown beside it on the canvas. */
  deletedNotice?: { message: Translatable; onUndo(): void; onDismiss(): void } | null;
  draftPrivacy?: { enabled: boolean; busy: boolean; change(enabled: boolean): void };
  usageStats?: { enabled: boolean; change(enabled: boolean): void };
  /** The one-time notice that usage statistics are sent: keep them on, or turn them off. */
  usageNotice?: { onAccept(): void; onDecline(): void } | null;
}
export interface EditorProps
  extends
    EditorCanvasProps,
    NodeToolActions,
    ClipboardActions,
    StructureActions,
    FileActions,
    DriveIndicators,
    HistoryActions,
    StatusMessages {}
