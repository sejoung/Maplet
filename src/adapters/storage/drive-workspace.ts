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
type Scope = 'localStorage' | 'sessionStorage';
const storageKey = (clientId: string) => `maplet:drive:${clientId}`;
function read(scope: Scope, clientId: string): unknown {
  try {
    return JSON.parse(window[scope].getItem(storageKey(clientId)) ?? 'null');
  } catch {
    return null;
  }
}
function write(scope: Scope, clientId: string, value: object | null): void {
  try {
    if (value) window[scope].setItem(storageKey(clientId), JSON.stringify(value));
    else window[scope].removeItem(storageKey(clientId));
  } catch {
    /* Drive remains usable when browser storage is unavailable. */
  }
}

/** The most recently changed workspace of any tab, for a later visit. */
export function readDriveWorkspace(clientId: string): DriveWorkspace | null {
  return parseDriveWorkspace(read('localStorage', clientId));
}
/** Which tab wrote the shared workspace; null for releases before tabs. */
export function readDriveWorkspaceOwner(clientId: string): string | null {
  const value = read('localStorage', clientId) as { tab?: unknown } | null;
  return typeof value?.tab === 'string' ? value.tab : null;
}
export function writeDriveWorkspace(
  clientId: string,
  workspace: DriveWorkspace | null,
  owner?: string,
): void {
  const safe = parseDriveWorkspace(workspace);
  write('localStorage', clientId, safe && (owner ? { ...safe, tab: owner } : safe));
}
/** This tab's own workspace, kept across reloads of the tab. */
export function readTabWorkspace(clientId: string): DriveWorkspace | null {
  return parseDriveWorkspace(read('sessionStorage', clientId));
}
export function writeTabWorkspace(clientId: string, workspace: DriveWorkspace | null): void {
  write('sessionStorage', clientId, parseDriveWorkspace(workspace));
}
