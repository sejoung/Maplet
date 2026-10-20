import { parseMaplet } from '../maplet/codec';

export interface DriveSnapshot {
  content: string;
  filename: string;
}
export interface DriveBaseline extends DriveSnapshot {
  fileId: string;
  version: string;
  attempt?: DriveSnapshot;
}
/** Content lives only with the IndexedDB draft, never workspace localStorage metadata. */
export function parseDriveBaseline(value: unknown): DriveBaseline | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DriveBaseline>;
  if (
    ![item.content, item.filename, item.fileId, item.version].every(
      (field) => typeof field === 'string' && field.length > 0,
    )
  )
    return null;
  try {
    parseMaplet(item.content!);
  } catch {
    return null;
  }
  let attempt: DriveSnapshot | undefined;
  if (
    item.attempt &&
    typeof item.attempt.content === 'string' &&
    typeof item.attempt.filename === 'string'
  ) {
    try {
      parseMaplet(item.attempt.content);
      attempt = { content: item.attempt.content, filename: item.attempt.filename };
    } catch {
      /* Discard an invalid pending snapshot. */
    }
  }
  return {
    content: item.content!,
    filename: item.filename!,
    fileId: item.fileId!,
    version: item.version!,
    ...(attempt && { attempt }),
  };
}
