import type { Dispatch } from 'react';
import type { DriveAuth, DriveFiles } from '../../adapters/drive/types';
import type { DriveWorkspace } from '../../adapters/storage/drive-workspace';
import { restoredSyncState } from '../../application/drive-restore';
import { useLatest } from '../../components/shared/useLatest';
import type { DriveOptions } from './DriveOptions';
import type { DriveWorkspaceAction, DriveWorkspaceState } from './state/driveWorkspaceState';
import { isDriveConflict } from './state/driveRules';
import { restoreDriveWorkspace } from './state/restoreDriveWorkspace';
import type { DriveConnection } from './useDriveConnection';
import type { DriveOperation } from './useDriveOperation';
import { useRunOnce } from '../useRunOnce';

interface Context {
  google: DriveAuth | null;
  drive: DriveFiles | null;
  options: DriveOptions;
  state: DriveWorkspaceState;
  draftWorkspace: DriveWorkspace | null;
  dispatch: Dispatch<DriveWorkspaceAction>;
  operation: DriveOperation;
  connection: DriveConnection;
  /** Keeps a merge conflict found while restoring for the conflict dialog. */
  capture(reason: unknown): void;
}

/** Reconnect a remembered workspace: automatically at startup, or when the user asks. */
export function useDriveRestore({
  google,
  drive,
  options,
  state,
  draftWorkspace,
  dispatch,
  operation,
  connection,
  capture,
}: Context) {
  const { content, filename, documentKey, hasLocalWork = false } = options;
  const { pending, synced } = state;
  const latest = useLatest({ documentKey, content, filename, hasLocalWork });
  const resumeDrive = async (automatic = false) => {
    const workspace = pending?.workspace ?? draftWorkspace;
    if (!google || !drive || !workspace || !operation.idle() || (!automatic && !connection.ready))
      return;
    const keepLocal = pending?.keepLocal ?? true;
    // Only restoring a file replaces the document; a folder alone leaves local work as is.
    const replacing = !keepLocal && Boolean(workspace.file || workspace.source);
    if (automatic && (!google.getToken() || (replacing && hasLocalWork))) return;
    if (!automatic && replacing && !(await options.allowReplace())) return;
    await operation.exclusive(
      async (latestOperation) => {
        // A replacement must not land on work that changed while Drive answered.
        const current = () =>
          latestOperation() &&
          documentKey === latest.current.documentKey &&
          (keepLocal ||
            (latest.current.hasLocalWork === hasLocalWork &&
              latest.current.content === content &&
              latest.current.filename === filename));
        try {
          if (!automatic) await connection.authorize();
          if (!current()) return;
          const restored = await restoreDriveWorkspace(
            drive,
            workspace,
            keepLocal,
            { content, filename },
            synced.baseline,
          );
          if (!current()) return;
          if (!keepLocal && restored.document)
            options.replace(restored.document.map, restored.document.filename);
          if (keepLocal && restored.merged)
            options.applyMerge?.({ content, filename }, restored.merged);
          const next = restoredSyncState(
            { opened: restored.document, file: restored.file },
            {
              keepLocal,
              remembered: Boolean(pending),
              content,
              filename,
              synced,
            },
          );
          dispatch({
            type: 'restored',
            folder: restored.folder,
            file: restored.file,
            source: restored.source,
            synced: next,
          });
          if (keepLocal && restored.document?.content === content && filename === next.filename)
            options.markSaved(content);
        } catch (reason) {
          // Superseded work must not report; a newer operation owns the dialog.
          if (current()) throw reason;
        }
      },
      (reason) => {
        if (isDriveConflict(reason)) {
          capture(reason);
          dispatch({ type: 'restoreConflicted', file: workspace.file, source: workspace.source });
        } else {
          dispatch({ type: 'failed' });
          connection.fail(reason, !automatic);
        }
      },
    );
  };
  useRunOnce(
    Boolean(
      options.restorationReady &&
      pending &&
      connection.connected &&
      !operation.busy &&
      (pending.keepLocal || !hasLocalWork || !(pending.workspace.file || pending.workspace.source)),
    ),
    () => resumeDrive(true),
  );
  return resumeDrive;
}
