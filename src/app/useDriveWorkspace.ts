import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { driveWorkspaceReducer, initialDriveWorkspace } from './driveWorkspaceState';

/** A reopened tab resumes its own file; others take the last file only if no open tab has it. */
function rememberedWorkspace(clientId: string, tab: TabSession): DriveWorkspace | null {
  const shared = readDriveWorkspace(clientId);
  const owner = readDriveWorkspaceOwner(clientId);
  const own = tab.reopened ? readTabWorkspace(clientId) : null;
  if (own) return own;
  if (!shared) return null;
  if (tab.reopened || tab.newMap !== null || (owner && tab.live.has(owner)))
    return { folder: shared.folder, file: null, source: null };
  return shared;
}

/** The Drive workspace state, remembered per tab and shared with tabs opened later. */
export function useDriveWorkspace(clientId: string, tab: TabSession = FRESH_TAB) {
  const [initial] = useState(() => rememberedWorkspace(clientId, tab));
  // Starting up must not replace the record another tab may still be relying on.
  const [initialRecord] = useState(() => JSON.stringify(initial));
  const changed = useRef(false);
  const [state, dispatch] = useReducer(driveWorkspaceReducer, initial, initialDriveWorkspace);
  const { folder, file, source, pending } = state;
  const active = useMemo(
    () => parseDriveWorkspace(folder ? { folder, file, source } : null),
    [folder, file, source],
  );
  useEffect(() => {
    const workspace = pending?.workspace ?? active;
    writeTabWorkspace(clientId, workspace);
    changed.current ||= JSON.stringify(workspace) !== initialRecord;
    if (changed.current) writeDriveWorkspace(clientId, workspace, tab.id);
  }, [clientId, pending, active, initialRecord, tab.id]);
  return {
    state,
    dispatch,
    /** What a draft remembers: the workspace still waiting to be resumed, or the active one. */
    draftWorkspace: pending?.keepLocal ? pending.workspace : active,
  };
}
