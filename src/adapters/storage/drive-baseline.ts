import { isNonEmptyString } from '../../domain/util/guards';
import { isJsonObject } from '../../domain/util/json';
import type { DriveBaseline } from '../../domain/merge/snapshot';

/**
 * Content lives only with the IndexedDB draft, never workspace localStorage metadata.
 * `valid` checks stored content with the caller's codec, so storage stays format-agnostic.
 */
export function parseDriveBaseline(
  value: unknown,
  valid: (content: string) => boolean,
): DriveBaseline | null {
  if (!isJsonObject(value)) return null;
  const { content, filename, fileId, version, attempt } = value;
  if (
    !isNonEmptyString(content) ||
    !isNonEmptyString(filename) ||
    !isNonEmptyString(fileId) ||
    !isNonEmptyString(version) ||
    !valid(content)
  )
    return null;
  // An invalid pending snapshot is discarded; the baseline itself stays usable.
  const pending =
    isJsonObject(attempt) &&
    typeof attempt.content === 'string' &&
    typeof attempt.filename === 'string' &&
    valid(attempt.content)
      ? { content: attempt.content, filename: attempt.filename }
      : undefined;
  return { content, filename, fileId, version, ...(pending && { attempt: pending }) };
}
