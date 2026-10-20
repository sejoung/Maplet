import { useEffect, useMemo, useState } from 'react';
import {
  parseDriveWorkspace,
  readDriveWorkspace,
  writeDriveWorkspace,
  type DriveWorkspace,
} from '../adapters/storage/drive-workspace';
import type { DriveFile } from '../adapters/drive/client';
import type { GoogleSelection } from '../adapters/drive/google';

export function useDriveWorkspace(clientId: string) {
  const [initial] = useState(() => readDriveWorkspace(clientId));
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
    writeDriveWorkspace(clientId, pending?.workspace ?? active);
  }, [clientId, pending, active]);
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
