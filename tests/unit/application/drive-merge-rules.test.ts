import { describe, expect, it } from 'vitest';
import { DriveMergeConflict, driveMerge } from '../../../src/application/drive-merge';
import { reconcileWrite, retryDelay } from '../../../src/application/drive-document-saver';
import { reconcileRestore, restoredSyncState } from '../../../src/application/drive-restore';
import { parseMaplet, serializeMaplet } from '../../../src/adapters/maplet/codec';
import { createMap, renameNode, updateNode } from '../../../src/domain/commands';

const merge = driveMerge({ parse: parseMaplet, serialize: serializeMaplet });
const map = createMap('Base');
const base = { content: serializeMaplet(map), filename: 'map.maplet' };
const titled = (title: string) => ({
  ...base,
  content: serializeMaplet(renameNode(map, 'root', title)),
});
const noted = { ...base, content: serializeMaplet(updateNode(map, 'root', { notes: 'Remote' })) };
const file = { id: 'f', version: '2' };

describe('three-way merge', () => {
  it('compares snapshots by map and filename', () => {
    expect(merge.same(base, { ...base })).toBe(true);
    expect(merge.same(base, titled('Other'))).toBe(false);
    expect(merge.same(base, { ...base, filename: 'other.maplet' })).toBe(false);
  });
  it('re-merges against current edits and keeps earlier choices', () => {
    const conflict = new DriveMergeConflict(
      base,
      titled('Mine'),
      titled('Theirs'),
      merge.merge(base, titled('Mine'), titled('Theirs')).conflicts,
      file,
    );
    const open = merge.remerge(conflict, titled('Newer'));
    expect('conflict' in open && open.conflict.local).toEqual(titled('Newer'));
    const [{ id }] = conflict.conflicts;
    const done = merge.remerge(conflict, titled('Newer'), { [id]: 'remote' });
    expect('merged' in done && parseMaplet(done.merged.content).nodes.root.title).toBe('Theirs');
    const kept = new DriveMergeConflict(base, titled('Mine'), noted, [], file, { [id]: 'local' });
    expect(merge.remerge(kept, titled('Mine'))).toMatchObject({ merged: { conflicts: [] } });
  });
  it('names the node each conflict concerns, or null for the document', () => {
    const conflicts = [...merge.merge(base, titled('Mine'), titled('Theirs')).conflicts];
    conflicts.push({ ...conflicts[0], id: 'filename', nodeId: null, path: ['filename'] });
    const conflict = new DriveMergeConflict(
      base,
      titled('Mine'),
      titled('Theirs'),
      conflicts,
      file,
    );
    expect(merge.nodeTitles(conflict)).toEqual(['Mine', null]);
  });
});

describe('a refused write', () => {
  it('is already stored when Drive holds the written snapshot', () => {
    expect(reconcileWrite(merge, titled('A'), titled('A'), base)).toEqual({ kind: 'stored' });
  });
  it('cannot merge without a base', () => {
    expect(reconcileWrite(merge, titled('A'), noted, null)).toEqual({
      kind: 'unknownBase',
      committed: false,
    });
  });
  it('rebases on an uncertain earlier write that Drive turns out to hold', () => {
    const step = reconcileWrite(merge, titled('Later'), titled('Earlier'), null, titled('Earlier'));
    expect(step).toMatchObject({ kind: 'merged', committed: true });
    expect(step.kind === 'merged' && parseMaplet(step.merged.content).nodes.root.title).toBe(
      'Later',
    );
  });
  it('merges distinct changes and reports overlapping ones', () => {
    expect(reconcileWrite(merge, titled('A'), noted, base)).toMatchObject({ kind: 'merged' });
    expect(reconcileWrite(merge, titled('A'), titled('B'), base)).toMatchObject({
      kind: 'conflict',
      base,
      committed: false,
    });
  });
  it('backs off exponentially', () => {
    expect([0, 1, 2].map(retryDelay)).toEqual([300, 600, 1200]);
  });
});

describe('restoring a workspace', () => {
  const remembered = { id: 'f', version: '1' };
  const baseline = { ...base, fileId: 'f', version: '1' };
  const check = {
    keepLocal: true,
    remembered,
    target: { id: 'f', version: '2' },
    remote: noted,
    baseline,
    local: titled('Mine'),
  };
  it('leaves replacing restores and copy sources alone', () => {
    const clean = { kind: 'clean', merged: null };
    expect(reconcileRestore(merge, { ...check, keepLocal: false })).toEqual(clean);
    expect(reconcileRestore(merge, { ...check, remembered: null })).toEqual(clean);
    expect(reconcileRestore(merge, { ...check, target: null })).toEqual(clean);
  });
  it('merges local work with the baseline it started from', () => {
    const outcome = reconcileRestore(merge, check);
    expect(
      outcome.kind === 'clean' && parseMaplet(outcome.merged!.content).nodes.root,
    ).toMatchObject({ title: 'Mine', notes: 'Remote' });
    expect(reconcileRestore(merge, { ...check, remote: titled('Theirs') })).toMatchObject({
      kind: 'conflict',
      conflict: { remoteFile: check.target },
    });
  });
  it('bases on a lost write that Drive holds', () => {
    const outcome = reconcileRestore(merge, {
      ...check,
      remote: titled('Mine'),
      baseline: { ...baseline, attempt: titled('Mine') },
      local: titled('Mine'),
    });
    expect(outcome).toMatchObject({ kind: 'clean', merged: { conflicts: [] } });
  });
  it('stops on a remote change without a trusted base', () => {
    const untrusted = { ...check, baseline: null };
    expect(reconcileRestore(merge, untrusted)).toEqual({ kind: 'changed' });
    expect(reconcileRestore(merge, { ...untrusted, local: noted })).toMatchObject({
      kind: 'clean',
    });
    expect(reconcileRestore(merge, { ...untrusted, target: remembered })).toMatchObject({
      kind: 'clean',
    });
  });
  it('takes the reopened file as saved, or keeps what this session knew', () => {
    const local = {
      keepLocal: true,
      remembered: false,
      content: 'local',
      filename: 'local.maplet',
      synced: { content: 'synced', filename: 'synced.maplet' },
    };
    expect(restoredSyncState({ opened: noted, file }, local)).toEqual({
      baseline: { ...noted, fileId: 'f', version: '2' },
      ...noted,
    });
    expect(restoredSyncState({ opened: null, file: null }, local)).toEqual({
      baseline: null,
      content: 'synced',
      filename: 'synced.maplet',
    });
    expect(restoredSyncState({ opened: null, file: null }, { ...local, remembered: true })).toEqual(
      { baseline: null, content: null, filename: 'local.maplet' },
    );
    expect(restoredSyncState({ opened: null, file: null }, { ...local, keepLocal: false })).toEqual(
      { baseline: null, content: 'local', filename: 'local.maplet' },
    );
  });
});
