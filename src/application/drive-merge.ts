import { AppError } from '../domain/errors';
import { own } from '../domain/ids';
import { equalMaps, mergeMaps, type MergeChoices, type MergeConflict } from '../domain/merge';
import { mergeValue } from '../domain/merge-values';
import type { MindMap } from '../domain/model';
import { plainTitle } from '../domain/rich-text';
import type { DriveSnapshot } from '../domain/snapshot';

/** A Drive file version as the sync rules see it; the adapter's file type fits structurally. */
export interface RemoteFile {
  id: string;
  version: string;
}
/** Turns snapshot content into maps and back; the app passes the native format codec. */
export interface MapCodec {
  parse(content: string): MindMap;
  serialize(map: MindMap): string;
}
export interface MergedSnapshot extends DriveSnapshot {
  conflicts: MergeConflict[];
}

/** Both sides changed the same values; the user picks per conflict, `choices` so far. */
export class DriveMergeConflict<File extends RemoteFile = RemoteFile> extends AppError {
  constructor(
    readonly base: DriveSnapshot,
    readonly local: DriveSnapshot,
    readonly remote: DriveSnapshot,
    readonly conflicts: MergeConflict[],
    readonly remoteFile: File,
    readonly choices: MergeChoices = {},
  ) {
    super('drive.driveFileChangedKeepLocal');
  }
}

/** Three-way merge rules for Drive snapshots, over the given codec. */
export function driveMerge(codec: MapCodec) {
  const same = (a: DriveSnapshot, b: DriveSnapshot) =>
    a.filename === b.filename && equalMaps(codec.parse(a.content), codec.parse(b.content));
  const merge = (
    base: DriveSnapshot,
    local: DriveSnapshot,
    remote: DriveSnapshot,
    choices: MergeChoices = {},
  ): MergedSnapshot => {
    const merged = mergeMaps(
      codec.parse(base.content),
      codec.parse(local.content),
      codec.parse(remote.content),
      choices,
    );
    const conflicts = [...merged.conflicts];
    const filename = mergeValue(
      { base: base.filename, local: local.filename, remote: remote.filename },
      { nodeId: null, path: ['filename'] },
      { conflicts, choices },
    ) as string;
    // Round-trip validation is also a final guard against invalid merged trees.
    const content = codec.serialize(merged.map);
    codec.parse(content);
    return { content, filename, conflicts };
  };
  /**
   * Merge a conflict again against the current local snapshot, so edits made while it was
   * open are kept. Open conflicts come back as a new conflict carrying every choice so far.
   */
  const remerge = <File extends RemoteFile>(
    conflict: DriveMergeConflict<File>,
    local: DriveSnapshot,
    choices: MergeChoices = {},
  ): { merged: MergedSnapshot } | { conflict: DriveMergeConflict<File> } => {
    const all = { ...conflict.choices, ...choices };
    const merged = merge(conflict.base, local, conflict.remote, all);
    if (!merged.conflicts.length) return { merged };
    return {
      conflict: new DriveMergeConflict(
        conflict.base,
        local,
        conflict.remote,
        merged.conflicts,
        conflict.remoteFile,
        all,
      ),
    };
  };
  /** The plain title of the node each conflict concerns, from either side; null if none. */
  const nodeTitles = ({ local, remote, conflicts }: DriveMergeConflict): (string | null)[] => {
    const mine = codec.parse(local.content),
      theirs = codec.parse(remote.content);
    return conflicts.map(({ nodeId }) => {
      const node = nodeId && (own(mine.nodes, nodeId) ?? own(theirs.nodes, nodeId));
      return node ? plainTitle(node.title) : null;
    });
  };
  return { same, merge, remerge, nodeTitles };
}
export type DriveMerge = ReturnType<typeof driveMerge>;
