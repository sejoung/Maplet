import { DriveConflict } from '../../../adapters/drive/client';
import type { DriveFiles } from '../../../adapters/drive/types';
import type { DriveWorkspace } from '../../../adapters/storage/drive-workspace';
import { isAutosaveFile, nativeFilename, parseDocument } from '../../../adapters/formats';
import { serializeMaplet } from '../../../adapters/maplet/codec';
import type { DriveBaseline, DriveSnapshot } from '../../../domain/merge/snapshot';
import { reconcileRestore } from '../../../application/drive-restore';
import { merge } from './driveRules';

/** Reopen a remembered workspace; kept local work is merged with what Drive now holds. */
export async function restoreDriveWorkspace(
  drive: DriveFiles,
  workspace: DriveWorkspace,
  keepLocal: boolean,
  local: Partial<DriveSnapshot> = {},
  baseline?: DriveBaseline | null,
) {
  const folder = await drive.folder(workspace.folder.id);
  const previous = workspace.file ?? workspace.source;
  if (!previous) return { folder, file: null, source: null, document: null, merged: null };
  const source = await drive.open(previous.id);
  const map = parseDocument(source.content);
  const file = isAutosaveFile(source, folder.id) && (!keepLocal || workspace.file) ? source : null;
  const remote = { content: serializeMaplet(map), filename: nativeFilename(source.name) };
  const outcome = reconcileRestore(merge, {
    keepLocal,
    remembered: workspace.file,
    target: file,
    remote,
    baseline,
    local,
  });
  if (outcome.kind === 'conflict') throw outcome.conflict;
  if (outcome.kind === 'changed') throw new DriveConflict();
  return { folder, file, source, document: { map, ...remote }, merged: outcome.merged };
}
export type RestoredWorkspace = Awaited<ReturnType<typeof restoreDriveWorkspace>>;
