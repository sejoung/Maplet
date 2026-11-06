import { AppError } from '../domain/errors';
import type { MergeConflict } from '../domain/merge/merge';
import { DriveMergeConflict, type DriveMerge, type RemoteFile } from './drive-merge';
import type { DriveBaseline, DriveSnapshot } from '../domain/merge/snapshot';

/** Writes tried per save before the last failure is reported. */
export const MAX_SAVE_ATTEMPTS = 3;
/** First backoff after a write whose outcome is unknown; it doubles per attempt. */
export const RETRY_BASE_DELAY_MS = 300;
export const retryDelay = (attempt: number) => RETRY_BASE_DELAY_MS * 2 ** attempt;

/** The Drive operations a save needs; the adapter's `DriveFiles` fits structurally. */
export interface DriveWriter<File extends RemoteFile> {
  open(id: string): Promise<File & { content: string; name: string }>;
  save(file: File, content: string, options: { overwrite: boolean; name: string }): Promise<File>;
}
/** How adapter errors read to the save rules; application code cannot name their classes. */
export interface SaveFailures {
  /** Drive refused the write because the file changed. */
  conflict(error: unknown): boolean;
  /** Repeating the request may succeed; whether it committed is unknown. */
  retryable(error: unknown): boolean;
  /** The error for a remote change that has no trusted base to merge against. */
  changed(): Error;
}
export interface SaverRules {
  merge: DriveMerge;
  /** The native snapshot of an opened Drive file. */
  read(file: { content: string; name: string }): DriveSnapshot;
  failures: SaveFailures;
}
export interface SaveResult<File> extends DriveSnapshot {
  file: File;
}
export type Rebase<File> = (
  before: DriveSnapshot,
  merged: DriveSnapshot,
  remote: DriveSnapshot,
  file: File,
) => void;

export type Reconciled =
  /** Drive already holds the snapshot being written. */
  | { kind: 'stored' }
  | { kind: 'unknownBase'; committed: boolean }
  | { kind: 'conflict'; base: DriveSnapshot; conflicts: MergeConflict[]; committed: boolean }
  | { kind: 'merged'; merged: DriveSnapshot; committed: boolean };

/**
 * After a refused write, decide from what Drive now holds. `committed` means the uncertain
 * earlier write is what Drive holds, so later edits rebase on it rather than the baseline.
 */
export function reconcileWrite(
  merge: DriveMerge,
  work: DriveSnapshot,
  remote: DriveSnapshot,
  base: DriveSnapshot | null,
  uncertain?: DriveSnapshot,
): Reconciled {
  if (merge.same(work, remote)) return { kind: 'stored' };
  const committed = Boolean(uncertain && merge.same(uncertain, remote));
  const from = committed ? uncertain! : base;
  if (!from) return { kind: 'unknownBase', committed };
  const merged = merge.merge(from, work, remote);
  return merged.conflicts.length
    ? { kind: 'conflict', base: from, conflicts: merged.conflicts, committed }
    : { kind: 'merged', merged, committed };
}

/** One instance per editor. Remembers writes whose response may have been lost. */
export class DriveDocumentSaver<File extends RemoteFile> {
  private uncertain = new Map<string, DriveSnapshot>();
  pending(fileId: string) {
    return this.uncertain.get(fileId);
  }
  constructor(
    private readonly drive: DriveWriter<File>,
    private readonly rules: SaverRules,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async save(
    file: File,
    local: DriveSnapshot,
    baseline: DriveBaseline | null,
    overwrite = false,
    current = () => true,
    rebase?: Rebase<File>,
    attempting?: (snapshot: DriveSnapshot) => void,
  ): Promise<SaveResult<File>> {
    const { merge, read, failures } = this.rules;
    let target = file,
      work = local;
    let base: DriveSnapshot | null = baseline?.fileId === file.id ? baseline : null;
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      if (!current()) throw new AppError('drive.documentBeingSavedHasChanged');
      try {
        attempting?.(work);
        const saved = await this.drive.save(target, work.content, {
          overwrite,
          name: work.filename,
        });
        this.uncertain.delete(file.id);
        return { ...work, file: saved };
      } catch (error) {
        // Authorization and other permanent failures are neither conflicts nor retryable.
        if (overwrite || (!failures.conflict(error) && !failures.retryable(error))) throw error;
        if (failures.retryable(error)) this.uncertain.set(file.id, work);
        const opened = await this.drive.open(file.id);
        if (!current()) throw error;
        const remote = read(opened);
        const step = reconcileWrite(
          merge,
          work,
          remote,
          base,
          this.uncertain.get(file.id) ?? baseline?.attempt,
        );
        if (step.kind === 'stored') {
          this.uncertain.delete(file.id);
          return { ...remote, file: opened };
        }
        if (step.committed) this.uncertain.delete(file.id);
        if (step.kind === 'unknownBase') throw failures.changed();
        if (step.kind === 'conflict')
          throw new DriveMergeConflict(step.base, work, remote, step.conflicts, opened);
        rebase?.(work, step.merged, remote, opened);
        base = remote;
        work = step.merged;
        target = opened;
        if (merge.same(work, remote)) return { ...work, file: opened };
        if (attempt === MAX_SAVE_ATTEMPTS - 1) throw error;
        if (failures.retryable(error)) await this.wait(retryDelay(attempt));
      }
    }
    throw failures.changed();
  }
}
