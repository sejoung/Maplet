import { DriveClient, DriveConflict } from '../adapters/drive/client';
import type { DriveWorkspace } from '../adapters/storage/drive-workspace';
import { parseDocument, nativeFilename } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';
import {
  DriveMergeConflict,
  mergeDriveSnapshots,
  sameDriveSnapshot,
  type DriveBaseline,
} from './driveMerge';

export async function restoreDriveWorkspace(
  drive: DriveClient,
  workspace: DriveWorkspace,
  keepLocal: boolean,
  localContent?: string,
  baseline?: DriveBaseline | null,
  localFilename?: string,
) {
  const folder = await drive.folder(workspace.folder.id);
  const previous = workspace.file ?? workspace.source;
  if (!previous) return { folder, file: null, source: null, document: null };
  const source = await drive.open(previous.id);
  const map = parseDocument(source.content);
  const file =
    /\.maplet$/i.test(source.name) &&
    source.parents?.includes(folder.id) &&
    (!keepLocal || workspace.file)
      ? source
      : null;
  const content = serializeMaplet(map);
  const remote = { content, filename: nativeFilename(source.name) };
  let merged = null;
  if (
    keepLocal &&
    file &&
    workspace.file &&
    baseline?.fileId === file.id &&
    baseline.version === workspace.file.version &&
    localContent
  ) {
    const local = { content: localContent, filename: localFilename ?? remote.filename };
    const base =
      baseline.attempt && sameDriveSnapshot(baseline.attempt, remote) ? baseline.attempt : baseline;
    merged = mergeDriveSnapshots(base, local, remote);
    if (merged.conflicts.length)
      throw new DriveMergeConflict(base, local, remote, merged.conflicts, source);
  }
  if (
    keepLocal &&
    workspace.file &&
    file &&
    source.version !== previous.version &&
    content !== localContent &&
    !merged
  )
    throw new DriveConflict();
  return {
    folder,
    file,
    source,
    document: { map, filename: nativeFilename(source.name), content },
    merged,
  };
}

type Restored = Awaited<ReturnType<typeof restoreDriveWorkspace>>;
interface LocalState {
  keepLocal: boolean;
  /** Restoring a workspace remembered from a previous visit rather than this session. */
  remembered: boolean;
  content: string;
  filename: string;
  synced: { content: string | null; filename: string | null };
}

/** What counts as saved to Drive after reconnecting a workspace. */
export function restoredSyncState(restored: Restored, local: LocalState) {
  const { document, file } = restored;
  let content: string | null = document?.content ?? local.content;
  if (!document && local.keepLocal)
    content = local.remembered ? null : (local.synced.content ?? local.content);
  const filename =
    document?.filename ??
    (local.keepLocal && !local.remembered
      ? (local.synced.filename ?? local.filename)
      : local.filename);
  const baseline: DriveBaseline | null =
    file && document
      ? {
          fileId: file.id,
          version: file.version,
          content: document.content,
          filename: document.filename,
        }
      : null;
  return { baseline, content, filename };
}
