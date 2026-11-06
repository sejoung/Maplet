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

/**
 * Write-back cache: one immutable active upload is owned by the caller; the buffer retains
 * only its latest successor and when the last upload of a document started. Updates return
 * a new buffer, or the same one when nothing changed.
 */
export interface SaveBuffer {
  readonly pending: Readonly<BufferedSave> | null;
  readonly lastStarted: { key: number; time: number } | null;
}
export const EMPTY_SAVE_BUFFER: SaveBuffer = { pending: null, lastStarted: null };

/** Make `snapshot` the pending save; a manual request stays manual until it is cleared. */
export function stageSave(
  buffer: SaveBuffer,
  key: number,
  snapshot: Snapshot,
  now: number,
  manual = false,
): SaveBuffer {
  const previous = buffer.pending?.key === key ? buffer.pending : null;
  const same = previous?.content === snapshot.content && previous.filename === snapshot.filename;
  if (same && (!manual || previous.manual)) return buffer;
  return {
    ...buffer,
    pending: {
      content: snapshot.content,
      filename: snapshot.filename,
      key,
      manual: manual || (previous?.manual ?? false),
      firstAt: previous?.firstAt ?? now,
      changedAt: same ? previous.changedAt : now,
    },
  };
}

export function clearSave(buffer: SaveBuffer, automaticOnly = false): SaveBuffer {
  if (!buffer.pending || (automaticOnly && buffer.pending.manual)) return buffer;
  return { ...buffer, pending: null };
}

export const startedSave = (buffer: SaveBuffer, key: number, now: number): SaveBuffer => ({
  ...buffer,
  lastStarted: { key, time: now },
});

/** Milliseconds until the pending save should start: at once when manual. */
export function saveDelay(buffer: SaveBuffer, now: number): number {
  const request = buffer.pending;
  if (!request || request.manual) return 0;
  const earliest =
    buffer.lastStarted?.key === request.key
      ? buffer.lastStarted.time + DRIVE_SAVE_POLICY.intervalMs
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
