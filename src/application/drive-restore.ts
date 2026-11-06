import {
  DriveMergeConflict,
  type DriveMerge,
  type MergedSnapshot,
  type RemoteFile,
} from './drive-merge';
import type { DriveBaseline, DriveSnapshot } from '../domain/snapshot';

interface RestoreCheck<File extends RemoteFile> {
  /** Local work stays and is merged with Drive instead of being replaced by it. */
  keepLocal: boolean;
  /** The autosave file remembered for the workspace, at the version last seen. */
  remembered: RemoteFile | null;
  /** The reopened file, when it can still take autosaves. */
  target: File | null;
  remote: DriveSnapshot;
  baseline?: DriveBaseline | null;
  local: { content?: string; filename?: string };
}
export type RestoreOutcome<File extends RemoteFile> =
  | { kind: 'clean'; merged: MergedSnapshot | null }
  | { kind: 'conflict'; conflict: DriveMergeConflict<File> }
  /** Drive changed and no trusted base tells its edits apart from local ones. */
  | { kind: 'changed' };

/** Whether kept local work can resume against what Drive now holds. */
export function reconcileRestore<File extends RemoteFile>(
  merge: DriveMerge,
  { keepLocal, remembered, target, remote, baseline, local }: RestoreCheck<File>,
): RestoreOutcome<File> {
  if (!keepLocal || !remembered || !target) return { kind: 'clean', merged: null };
  if (baseline?.fileId === target.id && baseline.version === remembered.version && local.content) {
    const mine = { content: local.content, filename: local.filename ?? remote.filename };
    const base =
      baseline.attempt && merge.same(baseline.attempt, remote) ? baseline.attempt : baseline;
    const merged = merge.merge(base, mine, remote);
    return merged.conflicts.length
      ? {
          kind: 'conflict',
          conflict: new DriveMergeConflict(base, mine, remote, merged.conflicts, target),
        }
      : { kind: 'clean', merged };
  }
  if (target.version !== remembered.version && remote.content !== local.content)
    return { kind: 'changed' };
  return { kind: 'clean', merged: null };
}

interface LocalState {
  keepLocal: boolean;
  /** Restoring a workspace remembered from a previous visit rather than this session. */
  remembered: boolean;
  content: string;
  filename: string;
  synced: { content: string | null; filename: string | null };
}
export interface SyncedState {
  /** Last snapshot known to be on Drive, used as the merge base. */
  baseline: DriveBaseline | null;
  /** Content and name that count as "saved to Drive" for dirty tracking. */
  content: string | null;
  filename: string | null;
}

/** What counts as saved to Drive after reconnecting a workspace; `opened` is its file's map. */
export function restoredSyncState(
  { opened, file }: { opened: DriveSnapshot | null; file: RemoteFile | null },
  local: LocalState,
): SyncedState {
  let content: string | null = opened?.content ?? local.content;
  if (!opened && local.keepLocal)
    content = local.remembered ? null : (local.synced.content ?? local.content);
  const filename =
    opened?.filename ??
    (local.keepLocal && !local.remembered
      ? (local.synced.filename ?? local.filename)
      : local.filename);
  const baseline: DriveBaseline | null =
    file && opened
      ? {
          fileId: file.id,
          version: file.version,
          content: opened.content,
          filename: opened.filename,
        }
      : null;
  return { baseline, content, filename };
}
