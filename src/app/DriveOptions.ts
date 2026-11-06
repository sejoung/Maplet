import type { MindMap } from '../domain/model';
import type { DriveSnapshot } from '../domain/snapshot';
import type { TabSession } from '../adapters/storage/tab-session';

/** What the Drive hooks need from the open document. */
export interface DriveOptions extends DriveSnapshot {
  documentKey: number;
  restorationReady?: boolean;
  hasLocalWork?: boolean;
  tab?: TabSession;
  markSaved(content: string, filename?: string): void;
  applyMerge?(base: DriveSnapshot, incoming: DriveSnapshot): void;
  /** May ask the user first; resolves false when they keep the current map. */
  allowReplace(): boolean | Promise<boolean>;
  replace(next: MindMap, name: string): void;
  setNotice(message: string): void;
}
