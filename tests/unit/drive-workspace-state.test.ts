import { describe, expect, it } from 'vitest';
import {
  driveWorkspaceReducer as reduce,
  initialDriveWorkspace,
  type DriveWorkspaceState,
} from '../../src/app/driveWorkspaceState';

const folder = { id: 'folder', name: 'Maps' };
const file = { id: 'file', name: 'map.maplet', version: '3', etag: null, parents: ['folder'] };
const local = { content: 'local', filename: 'local.maplet' };
const remembered = { folder, file, source: null };
const attached: DriveWorkspaceState = {
  ...initialDriveWorkspace(null),
  folder,
  file,
  source: file,
  synced: { baseline: { ...local, fileId: 'file', version: '3' }, ...local },
  paused: true,
};

describe('Drive workspace state', () => {
  it('starts from a remembered workspace waiting to be restored', () => {
    expect(initialDriveWorkspace(remembered)).toMatchObject({
      folder,
      file: null,
      pending: { workspace: remembered, keepLocal: false },
      activity: 'idle',
      dialog: null,
    });
  });
  it('opens and closes the dialog and records activity', () => {
    const shown = reduce(attached, { type: 'show' });
    expect(shown.dialog).toBe('drive');
    expect(reduce(shown, { type: 'close' }).dialog).toBeNull();
    expect(reduce(attached, { type: 'activity', activity: 'saving' }).activity).toBe('saving');
  });
  it('detaches the file only when another folder is picked', () => {
    const same = reduce(attached, { type: 'folderPicked', folder, local });
    expect(same).toMatchObject({ file, activity: 'folderSelected', dialog: 'drive' });
    const other = { id: 'other', name: 'Other' };
    expect(reduce(attached, { type: 'folderPicked', folder: other, local })).toMatchObject({
      folder: other,
      file: null,
      source: null,
      synced: { baseline: null, ...local },
      paused: false,
    });
    expect(reduce(attached, { type: 'folderPicked', folder: null, local })).toMatchObject({
      folder,
      activity: 'folderCancelled',
      dialog: 'drive',
    });
  });
  it('detaches when a remembered workspace is replaced by a picked folder', () => {
    const waiting = initialDriveWorkspace(remembered);
    expect(reduce(waiting, { type: 'folderPicked', folder, local })).toMatchObject({
      pending: null,
      synced: { content: 'local' },
    });
  });
  it('attaches an opened file as its source and, inside the folder, its autosave target', () => {
    const opened = reduce(attached, { type: 'opened', file: null, source: file, snapshot: local });
    expect(opened).toMatchObject({ file: null, source: file, paused: false, activity: 'opened' });
    expect(opened.synced.baseline).toEqual({ ...local, fileId: 'file', version: '3' });
    expect(reduce(attached, { type: 'fileCancelled' })).toMatchObject({
      activity: 'fileCancelled',
      dialog: 'drive',
    });
  });
  it('adopts a stored snapshot without extra fields', () => {
    const next = { ...file, version: '4' };
    // A save result carries its file too; only content and name become the baseline.
    const result = { ...local, file: next };
    const stored = reduce(
      { ...attached, dialog: 'conflict' },
      { type: 'stored', file: next, snapshot: result, activity: 'saved' },
    );
    expect(stored).toMatchObject({ file: next, source: next, folder, dialog: null, paused: false });
    expect(stored.synced.baseline).toEqual({ ...local, fileId: 'file', version: '4' });
  });
  it('enters a conflict, pausing autosave', () => {
    expect(reduce(attached, { type: 'conflict' })).toMatchObject({
      paused: true,
      dialog: 'conflict',
      activity: 'conflict',
    });
    const waiting = initialDriveWorkspace(remembered);
    expect(reduce(waiting, { type: 'restoreConflicted', file, source: null })).toMatchObject({
      file,
      pending: null,
      dialog: 'conflict',
    });
  });
  it('pauses on failure and keeps the activity unless one is given', () => {
    expect(reduce(attached, { type: 'failed' })).toMatchObject({ paused: true, activity: 'idle' });
    expect(reduce(attached, { type: 'failed', activity: 'saveFailed' }).activity).toBe(
      'saveFailed',
    );
  });
  it('resumes a restored workspace', () => {
    const synced = { baseline: null, content: 'x', filename: 'x.maplet' };
    const waiting = {
      ...initialDriveWorkspace(remembered),
      paused: true,
      dialog: 'drive' as const,
    };
    expect(reduce(waiting, { type: 'restored', folder, file, source: file, synced })).toMatchObject(
      { file, synced, pending: null, paused: false, activity: 'reconnected', dialog: null },
    );
  });
  it('clears the file, and disconnecting also forgets the folder', () => {
    expect(reduce(attached, { type: 'cleared', local })).toMatchObject({
      folder,
      file: null,
      pending: null,
      synced: { baseline: null, ...local },
    });
    expect(reduce(attached, { type: 'disconnected', local })).toMatchObject({
      folder: null,
      activity: 'disconnected',
    });
  });
  it('resumes a draft only within the current folder', () => {
    const baseline = { ...local, fileId: 'file', version: '1' };
    const resumed = reduce(attached, { type: 'draftRestored', workspace: remembered, baseline });
    expect(resumed).toMatchObject({
      file: null,
      pending: { workspace: remembered, keepLocal: true },
      synced: { baseline, content: 'local' },
    });
    const elsewhere = { ...remembered, folder: { id: 'other', name: 'Other' } };
    expect(
      reduce(attached, { type: 'draftRestored', workspace: elsewhere, baseline: null }),
    ).toMatchObject({ folder, pending: null, synced: { baseline: null } });
  });
});
