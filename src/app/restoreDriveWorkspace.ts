import { DriveClient, DriveConflict } from '../adapters/drive/client';
import type { DriveWorkspace } from '../adapters/storage/drive-workspace';
import { parseDocument, nativeFilename } from '../adapters/documents';
import { serializeMaplet } from '../adapters/maplet/codec';

export async function restoreDriveWorkspace(
  drive: DriveClient,
  workspace: DriveWorkspace,
  keepLocal: boolean,
  localContent?: string,
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
  if (
    keepLocal &&
    workspace.file &&
    file &&
    source.version !== previous.version &&
    content !== localContent
  )
    throw new DriveConflict();
  return {
    folder,
    file,
    source,
    document: { map, filename: nativeFilename(source.name), content },
  };
}
