import { DriveConflict, retryableDriveError } from '../adapters/drive/client';
import type { DriveFile, DriveFiles } from '../adapters/drive/types';
import { nativeFilename } from '../adapters/formats';
import { parseMaplet, serializeMaplet } from '../adapters/maplet/codec';
import { DriveDocumentSaver } from '../application/drive-document-saver';
import { DriveMergeConflict, driveMerge } from '../application/drive-merge';

/** The application's Drive sync rules, bound to the native format and the Drive adapter. */
export const merge = driveMerge({ parse: parseMaplet, serialize: serializeMaplet });

/** Either kind of conflict: a refused write, or changes the user has to choose between. */
export const isDriveConflict = (reason: unknown) =>
  reason instanceof DriveConflict || reason instanceof DriveMergeConflict;

export type DriveSaver = DriveDocumentSaver<DriveFile>;
export const createDriveSaver = (
  drive: Pick<DriveFiles, 'open' | 'save'>,
  wait?: (ms: number) => Promise<void>,
): DriveSaver =>
  new DriveDocumentSaver(
    drive,
    {
      merge,
      read: (file) => ({
        content: serializeMaplet(parseMaplet(file.content)),
        filename: nativeFilename(file.name),
      }),
      failures: {
        conflict: (error) => error instanceof DriveConflict,
        retryable: retryableDriveError,
        changed: () => new DriveConflict(),
      },
    },
    wait,
  );
