import { parseMaplet, serializeMaplet } from '../adapters/maplet/codec';
import { DriveConflict, type DriveFile } from '../adapters/drive/client';
import { mergeMaps, type MergeChoices, type MergeConflict } from '../domain/merge';
import { mergeValue } from '../domain/merge-values';
import { equalMaps } from '../domain/merge';
import type { DriveSnapshot } from '../adapters/storage/drive-baseline';
export type { DriveSnapshot, DriveBaseline } from '../adapters/storage/drive-baseline';
export const sameDriveSnapshot = (a: DriveSnapshot, b: DriveSnapshot) =>
  a.filename === b.filename && equalMaps(parseMaplet(a.content), parseMaplet(b.content));

export function mergeDriveSnapshots(
  base: DriveSnapshot,
  local: DriveSnapshot,
  remote: DriveSnapshot,
  choices: MergeChoices = {},
) {
  const merged = mergeMaps(
    parseMaplet(base.content),
    parseMaplet(local.content),
    parseMaplet(remote.content),
    choices,
  );
  const conflicts = [...merged.conflicts];
  const filename = mergeValue(
    base.filename,
    local.filename,
    remote.filename,
    null,
    ['filename'],
    conflicts,
    choices,
  ) as string;
  // Round-trip validation is also a final guard against invalid merged trees.
  const content = serializeMaplet(merged.map);
  parseMaplet(content);
  return { content, filename, conflicts };
}
export class DriveMergeConflict extends DriveConflict {
  constructor(
    readonly base: DriveSnapshot,
    readonly local: DriveSnapshot,
    readonly remote: DriveSnapshot,
    readonly conflicts: MergeConflict[],
    readonly remoteFile: DriveFile,
    readonly choices: MergeChoices = {},
  ) {
    super();
  }
}
