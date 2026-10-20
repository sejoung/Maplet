export const DRIVE_SAVE_POLICY = { idleMs: 3000, intervalMs: 5000, maxWaitMs: 15000 } as const;
interface Snapshot {
  content: string;
  filename: string;
}
interface BufferedSave extends Snapshot {
  key: number;
  manual: boolean;
  firstAt: number;
  changedAt: number;
}

/** Write-back cache: one immutable active upload is owned by the caller; retain only its latest successor. */
export class DriveSaveBuffer {
  pending: BufferedSave | null = null;
  private lastStarted: { key: number; time: number } | null = null;

  stage(key: number, snapshot: Snapshot, now: number, manual = false): boolean {
    const previous = this.pending?.key === key ? this.pending : null;
    const same = previous?.content === snapshot.content && previous.filename === snapshot.filename;
    if (same && (!manual || previous.manual)) return false;
    this.pending = {
      content: snapshot.content,
      filename: snapshot.filename,
      key,
      manual: manual || (previous?.manual ?? false),
      firstAt: previous?.firstAt ?? now,
      changedAt: same ? previous.changedAt : now,
    };
    return true;
  }

  clear(automaticOnly = false): boolean {
    if (!this.pending || (automaticOnly && this.pending.manual)) return false;
    this.pending = null;
    return true;
  }

  started(key: number, now: number): void {
    this.lastStarted = { key, time: now };
  }

  delay(now: number): number {
    const request = this.pending;
    if (!request || request.manual) return 0;
    const earliest =
      this.lastStarted?.key === request.key
        ? this.lastStarted.time + DRIVE_SAVE_POLICY.intervalMs
        : 0;
    return Math.max(
      0,
      Math.max(
        earliest,
        Math.min(
          request.changedAt + DRIVE_SAVE_POLICY.idleMs,
          request.firstAt + DRIVE_SAVE_POLICY.maxWaitMs,
        ),
      ) - now,
    );
  }
}
