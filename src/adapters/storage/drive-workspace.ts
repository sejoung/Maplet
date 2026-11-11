import { isNonEmptyString } from '../../domain/util/guards';
import { isJsonObject } from '../../domain/util/json';
import type { DriveFile, DriveFolder } from '../drive/types';
import { readJsonItem, writeJsonItem, type StorageScope } from './web-storage';

/** The Drive folder and files a tab works with; metadata only, never content or tokens. */
export interface DriveWorkspace {
  folder: DriveFolder;
  file: DriveFile | null;
  source: DriveFile | null;
}

function file(value: unknown): DriveFile | null {
  if (!isJsonObject(value)) return null;
  const { id, name, mimeType, version, etag, parents } = value;
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(version) ||
    !(etag === null || typeof etag === 'string')
  )
    return null;
  return {
    id,
    name,
    ...(typeof mimeType === 'string' ? { mimeType } : {}),
    version,
    etag,
    ...(Array.isArray(parents) && parents.every(isNonEmptyString) ? { parents: [...parents] } : {}),
  };
}
/** Copy only known fields from untrusted stored data. */
export function parseDriveWorkspace(value: unknown): DriveWorkspace | null {
  if (!isJsonObject(value)) return null;
  const { folder } = value;
  if (!isJsonObject(folder) || !isNonEmptyString(folder.id) || !isNonEmptyString(folder.name))
    return null;
  const target = file(value.file),
    source = file(value.source);
  if ((value.file != null && !target) || (value.source != null && !source)) return null;
  return { folder: { id: folder.id, name: folder.name }, file: target, source };
}

const storageKey = (clientId: string) => `maplet:drive:${clientId}`;
const read = (scope: StorageScope, clientId: string) => readJsonItem(scope, storageKey(clientId));
const write = (scope: StorageScope, clientId: string, value: object | null) =>
  writeJsonItem(scope, storageKey(clientId), value);

/** The most recently changed workspace of any tab, for a later visit. */
export function readDriveWorkspace(clientId: string): DriveWorkspace | null {
  return parseDriveWorkspace(read('local', clientId));
}
/** Which tab wrote the shared workspace; null for releases before tabs. */
export function readDriveWorkspaceOwner(clientId: string): string | null {
  const value = read('local', clientId);
  return isJsonObject(value) && typeof value.tab === 'string' ? value.tab : null;
}
export function writeDriveWorkspace(
  clientId: string,
  workspace: DriveWorkspace | null,
  owner?: string,
): void {
  const safe = parseDriveWorkspace(workspace);
  write('local', clientId, safe && (owner ? { ...safe, tab: owner } : safe));
}
/** This tab's own workspace, kept across reloads of the tab. */
export function readTabWorkspace(clientId: string): DriveWorkspace | null {
  return parseDriveWorkspace(read('session', clientId));
}
export function writeTabWorkspace(clientId: string, workspace: DriveWorkspace | null): void {
  write('session', clientId, parseDriveWorkspace(workspace));
}
