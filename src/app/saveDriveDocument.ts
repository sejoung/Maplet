import type { DriveClient, DriveFile } from '../adapters/drive/client';

export function saveDriveDocument(
  drive: DriveClient,
  file: DriveFile | null,
  target: { create: boolean; name: string },
  content: string,
  folderId: string,
  overwrite: boolean,
) {
  if (target.create || !file) return drive.create(target.name, content, folderId);
  return target.name === file.name
    ? drive.save(file, content, overwrite)
    : drive.save(file, content, overwrite, target.name);
}
