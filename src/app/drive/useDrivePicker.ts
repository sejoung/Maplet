import type { Dispatch } from 'react';
import type { DriveAuth, DriveFiles, DriveFolder, PickKind } from '../../adapters/drive/types';
import { isAutosaveFile, isDriveMaplet, nativeFilename } from '../../adapters/formats';
import { parseMaplet, serializeMaplet } from '../../adapters/maplet/codec';
import { AppError } from '../../domain/errors';
import { useI18n } from '../../i18n/react';
import type { DriveOptions } from './DriveOptions';
import type { DriveWorkspaceAction, DriveWorkspaceState } from './state/driveWorkspaceState';
import type { DriveConnection } from './useDriveConnection';
import type { DriveOperation } from './useDriveOperation';

interface Context {
  google: DriveAuth | null;
  drive: DriveFiles | null;
  options: DriveOptions;
  state: DriveWorkspaceState;
  dispatch: Dispatch<DriveWorkspaceAction>;
  operation: DriveOperation;
  connection: DriveConnection;
}

/** Choosing a save folder and opening files through Google's Picker. */
export function useDrivePicker({
  google,
  drive,
  options,
  state,
  dispatch,
  operation,
  connection,
}: Context) {
  const { language, t } = useI18n();
  const { content, filename } = options;
  const { folder: saveFolder, pending } = state;
  /** The Picker covers the page, so the Drive dialog closes while it is open. */
  const pick = (picker: DriveAuth, kind: PickKind) => {
    dispatch({ type: 'close' });
    return picker.pick(kind, {
      language,
      title: t(kind === 'folder' ? 'drive.pickerFolderTitle' : 'drive.pickerFileTitle'),
    });
  };
  const chooseSaveFolder = async () => {
    if (!google || !connection.ready) return;
    await operation.exclusive(
      async (current) => {
        await connection.authorize();
        if (!current()) return;
        const folder = await pick(google, 'folder');
        if (!current()) return;
        dispatch({ type: 'folderPicked', folder, local: { content, filename } });
      },
      (reason) => connection.fail(reason),
    );
  };
  const open = async () => {
    if (!google || !drive || !saveFolder || pending || !connection.ready || !operation.idle())
      return;
    if (!(await options.allowReplace())) return;
    await operation.exclusive(
      async (current) => {
        await connection.authorize();
        if (!current()) return;
        const selected = await pick(google, 'file');
        if (!current()) return;
        if (!selected) return dispatch({ type: 'fileCancelled' });
        const file = await drive.open(selected.id);
        if (!current()) return;
        if (!isDriveMaplet(file)) throw new AppError('drive.onlyMapletFiles');
        const next = parseMaplet(file.content);
        const name = nativeFilename(file.name);
        options.replace(next, name);
        dispatch({
          type: 'opened',
          file: isAutosaveFile(file, saveFolder.id) ? file : null,
          source: file,
          snapshot: { content: serializeMaplet(next), filename: name },
        });
      },
      (reason) => {
        connection.fail(reason);
        dispatch({ type: 'activity', activity: 'openFailed' });
      },
    );
  };
  return {
    chooseSaveFolder,
    open,
    /** A folder for "save a copy", inside the running save operation; null when cancelled. */
    pickCopyFolder: async (): Promise<DriveFolder | null> => {
      if (!google) return null;
      await connection.prepareNow();
      const folder = await pick(google, 'folder');
      if (!folder) dispatch({ type: 'folderPicked', folder: null, local: { content, filename } });
      return folder;
    },
  };
}
