import type { DriveFile } from '../drive/client';
import type { GoogleSelection } from '../drive/google';

export interface DriveWorkspace {
  folder: GoogleSelection;
  file: DriveFile | null;
  source: DriveFile | null;
}
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function file(value: unknown): DriveFile | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DriveFile>;
  if (
    !text(item.id) ||
    !text(item.name) ||
    !text(item.version) ||
    !(item.etag === null || typeof item.etag === 'string')
  )
    return null;
  return {
    id: item.id,
    name: item.name,
    version: item.version,
    etag: item.etag,
    ...(Array.isArray(item.parents) && item.parents.every(text)
      ? { parents: [...item.parents] }
      : {}),
  };
}
export function parseDriveWorkspace(value: unknown): DriveWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DriveWorkspace>;
  if (!item.folder || !text(item.folder.id) || !text(item.folder.name)) return null;
  const target = file(item.file),
    source = file(item.source);
  if ((item.file != null && !target) || (item.source != null && !source)) return null;
  return { folder: { id: item.folder.id, name: item.folder.name }, file: target, source };
}
export function readDriveWorkspace(clientId: string): DriveWorkspace | null {
  try {
    return parseDriveWorkspace(
      JSON.parse(localStorage.getItem(`maplet:drive:${clientId}`) ?? 'null'),
    );
  } catch {
    return null;
  }
}
export function writeDriveWorkspace(clientId: string, workspace: DriveWorkspace | null): void {
  try {
    const key = `maplet:drive:${clientId}`;
    const safe = parseDriveWorkspace(workspace);
    if (safe) localStorage.setItem(key, JSON.stringify(safe));
    else localStorage.removeItem(key);
  } catch {
    /* Drive remains usable when browser storage is unavailable. */
  }
}
