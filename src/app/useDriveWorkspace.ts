import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseDriveWorkspace,
  readDriveWorkspace,
  readDriveWorkspaceOwner,
  readTabWorkspace,
  writeDriveWorkspace,
  writeTabWorkspace,
  type DriveWorkspace,
} from '../adapters/storage/drive-workspace';
import { FRESH_TAB, type TabSession } from '../adapters/storage/tab-session';
import type { DriveFile } from '../adapters/drive/client';
import type { GoogleSelection } from '../adapters/drive/google';

/** A reopened tab resumes its own file; others take the last file only if no open tab has it. */
function initialWorkspace(clientId: string, tab: TabSession): DriveWorkspace | null {
  const shared = readDriveWorkspace(clientId);
  const owner = readDriveWorkspaceOwner(clientId);
  const own = tab.reopened ? readTabWorkspace(clientId) : null;
  if (own) return own;
  if (!shared) return null;
  if (tab.reopened || tab.newMap !== null || (owner && tab.live.has(owner)))
    return { folder: shared.folder, file: null, source: null };
  return shared;
}

export function useDriveWorkspace(clientId: string, tab: TabSession = FRESH_TAB) {
  const [initial] = useState(() => initialWorkspace(clientId, tab));
  // Starting up must not replace the record another tab may still be relying on.
  const [initialRecord] = useState(() => JSON.stringify(initial));
  const changed = useRef(false);
  const [saveFolder, setSaveFolder] = useState<GoogleSelection | null>(initial?.folder ?? null);
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [sourceFile, setSourceFile] = useState<DriveFile | null>(null);
  const [pending, setPending] = useState<{ workspace: DriveWorkspace; keepLocal: boolean } | null>(
    initial ? { workspace: initial, keepLocal: false } : null,
  );
  const active = useMemo(
    () =>
      parseDriveWorkspace(
        saveFolder ? { folder: saveFolder, file: driveFile, source: sourceFile } : null,
      ),
    [saveFolder, driveFile, sourceFile],
  );
  useEffect(() => {
    const workspace = pending?.workspace ?? active;
    writeTabWorkspace(clientId, workspace);
    changed.current ||= JSON.stringify(workspace) !== initialRecord;
    if (changed.current) writeDriveWorkspace(clientId, workspace, tab.id);
  }, [clientId, pending, active, initialRecord, tab.id]);
  const restoreDraftWorkspace = (value: unknown) => {
    const candidate = parseDriveWorkspace(value);
    const workspace = candidate?.folder.id === saveFolder?.id ? candidate : null;
    setDriveFile(null);
    setSourceFile(null);
    if (workspace) setSaveFolder(workspace.folder);
    setPending(workspace ? { workspace, keepLocal: true } : null);
  };
  return {
    saveFolder,
    setSaveFolder,
    driveFile,
    setDriveFile,
    sourceFile,
    setSourceFile,
    pending,
    setPending,
    restoreDraftWorkspace,
    draftWorkspace: pending?.keepLocal ? pending.workspace : active,
  };
}
