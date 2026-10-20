import {
  DriveAuthError,
  DriveClient,
  DriveConflict,
  DriveRequestError,
  type DriveFile,
} from '../adapters/drive/client';
import { nativeFilename } from '../adapters/documents';
import { parseMaplet, serializeMaplet } from '../adapters/maplet/codec';
import {
  DriveMergeConflict,
  mergeDriveSnapshots,
  sameDriveSnapshot,
  type DriveBaseline,
  type DriveSnapshot,
} from './driveMerge';

const same = sameDriveSnapshot;
const retryable = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof DriveRequestError &&
    (error.status === 408 || error.status === 429 || error.status >= 500));
export interface SaveResult extends DriveSnapshot {
  file: DriveFile;
}

/** One instance per editor. Remembers writes whose response may have been lost. */
export class DriveDocumentSaver {
  private uncertain = new Map<string, DriveSnapshot>();
  pending(fileId: string) {
    return this.uncertain.get(fileId);
  }
  constructor(
    private readonly drive: DriveClient,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async save(
    file: DriveFile,
    local: DriveSnapshot,
    baseline: DriveBaseline | null,
    overwrite = false,
    current = () => true,
    rebase?: (
      before: DriveSnapshot,
      merged: DriveSnapshot,
      remote: DriveSnapshot,
      file: DriveFile,
    ) => void,
    attempting?: (snapshot: DriveSnapshot) => void,
  ): Promise<SaveResult> {
    let target = file,
      work = local;
    let base: DriveSnapshot | null = baseline?.fileId === file.id ? baseline : null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!current()) throw new Error('저장 대상 문서가 변경되었습니다.');
      try {
        attempting?.(work);
        const saved =
          work.filename === target.name
            ? await this.drive.save(target, work.content, overwrite)
            : await this.drive.save(target, work.content, overwrite, work.filename);
        this.uncertain.delete(file.id);
        return { ...work, file: saved };
      } catch (error) {
        if (
          overwrite ||
          error instanceof DriveAuthError ||
          (!(error instanceof DriveConflict) && !retryable(error))
        )
          throw error;
        if (retryable(error)) this.uncertain.set(file.id, work);
        const opened = await this.drive.open(file.id);
        if (!current()) throw error;
        const remote = {
          content: serializeMaplet(parseMaplet(opened.content)),
          filename: nativeFilename(opened.name),
        };
        if (same(work, remote)) {
          this.uncertain.delete(file.id);
          return { ...remote, file: opened };
        }
        const uncertain = this.uncertain.get(file.id) ?? baseline?.attempt;
        if (uncertain && same(uncertain, remote)) {
          // Our previous request committed. Rebase later edits on that write.
          base = uncertain;
          this.uncertain.delete(file.id);
        }
        if (!base) throw new DriveConflict();
        const merged = mergeDriveSnapshots(base, work, remote);
        if (merged.conflicts.length)
          throw new DriveMergeConflict(base, work, remote, merged.conflicts, opened);
        rebase?.(work, merged, remote, opened);
        base = remote;
        work = merged;
        target = opened;
        if (same(work, remote)) return { ...work, file: opened };
        if (attempt === 2) throw error;
        if (retryable(error)) await this.wait(300 * 2 ** attempt);
      }
    }
    throw new DriveConflict();
  }
}
