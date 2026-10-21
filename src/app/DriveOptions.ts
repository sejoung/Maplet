import type { MindMap } from '../domain/model';
import type { TabSession } from '../adapters/storage/tab-session';
import type { DriveSnapshot } from './driveMerge';

export interface DriveOptions extends DriveSnapshot {
  documentKey: number;
  restorationReady?: boolean;
  hasLocalWork?: boolean;
  tab?: TabSession;
  markSaved(content: string, filename?: string): void;
  applyMerge?(base: DriveSnapshot, incoming: DriveSnapshot): void;
  allowReplace(): boolean;
  replace(next: MindMap, name: string): void;
  setNotice(message: string): void;
}
