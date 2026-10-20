import { describe, expect, it, vi } from 'vitest';
import {
  DriveClient,
  DriveConflict,
  DriveAuthError,
  DriveRequestError,
} from '../../src/adapters/drive/client';
import { DriveDocumentSaver } from '../../src/app/DriveDocumentSaver';
import { DriveMergeConflict, mergeDriveSnapshots } from '../../src/app/driveMerge';
import { createMap, renameNode, updateNode } from '../../src/domain/commands';
import { serializeMaplet, parseMaplet } from '../../src/adapters/maplet/codec';

const map = createMap('Base'),
  content = serializeMaplet(map);
const file = { id: 'f', name: 'map.maplet', version: '1', etag: null };
const baseline = { fileId: 'f', version: '1', content, filename: file.name };
const snapshot = (title: string) => ({
  content: serializeMaplet(renameNode(map, 'root', title)),
  filename: file.name,
});
function setup() {
  const api = { save: vi.fn(), open: vi.fn() };
  const saver = new DriveDocumentSaver(api as unknown as DriveClient, async () => {});
  return { api, saver };
}
describe('Drive save reconciliation', () => {
  it('refreshes a changed version with identical content instead of reporting a conflict', async () => {
    const { api, saver } = setup();
    api.save
      .mockRejectedValueOnce(new DriveConflict())
      .mockResolvedValueOnce({ ...file, version: '3' });
    api.open.mockResolvedValueOnce({ ...file, version: '2', content });
    const result = await saver.save(file, snapshot('Local'), baseline);
    expect(result.file.version).toBe('3');
    expect(api.save.mock.calls[1][0].version).toBe('2');
    expect(parseMaplet(result.content).nodes.root.title).toBe('Local');
  });
  it('merges distinct properties and saves using the fetched remote version', async () => {
    const { api, saver } = setup();
    api.save
      .mockRejectedValueOnce(new DriveConflict())
      .mockResolvedValueOnce({ ...file, version: '3' });
    api.open.mockResolvedValueOnce({
      ...file,
      version: '2',
      content: serializeMaplet(updateNode(map, 'root', { notes: 'Remote' })),
    });
    const result = await saver.save(file, snapshot('Local'), baseline);
    expect(parseMaplet(result.content).nodes.root).toMatchObject({
      title: 'Local',
      notes: 'Remote',
    });
    expect(api.save.mock.calls[1][0].version).toBe('2');
  });
  it('returns a property-level conflict without writing over either side', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValueOnce(new DriveConflict());
    api.open.mockResolvedValueOnce({
      ...file,
      version: '2',
      ...snapshot('Remote'),
      name: file.name,
    });
    await expect(saver.save(file, snapshot('Local'), baseline)).rejects.toMatchObject({
      conflicts: [expect.objectContaining({ nodeId: 'root', path: ['title'] })],
    });
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('recognizes an upload that committed but lost its response', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValueOnce(new TypeError('Network lost'));
    api.open.mockResolvedValueOnce({ ...file, version: '2', content: snapshot('Local').content });
    const result = await saver.save(file, snapshot('Local'), baseline);
    expect(result.file.version).toBe('2');
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('recognizes its uncertain previous write when the user retries with newer edits', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValueOnce(new TypeError('Lost response'));
    api.open.mockRejectedValueOnce(new TypeError('Offline'));
    await expect(saver.save(file, snapshot('First'), baseline)).rejects.toThrow('Offline');
    api.save
      .mockRejectedValueOnce(new DriveConflict())
      .mockResolvedValueOnce({ ...file, version: '3' });
    api.open.mockResolvedValueOnce({ ...file, version: '2', content: snapshot('First').content });
    const result = await saver.save(file, snapshot('Latest'), baseline);
    expect(parseMaplet(result.content).nodes.root.title).toBe('Latest');
    expect(api.save.mock.calls[2][0].version).toBe('2');
  });
  it('retries a transient failure and checks the remote file before writing again', async () => {
    const { api, saver } = setup();
    api.save
      .mockRejectedValueOnce(new DriveRequestError(503))
      .mockResolvedValueOnce({ ...file, version: '2' });
    api.open.mockResolvedValueOnce({ ...file, content });
    await saver.save(file, snapshot('Local'), baseline);
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledTimes(2);
  });
  it('bounds retries and never retries authorization failures', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValue(new DriveConflict());
    api.open.mockResolvedValue({ ...file, content });
    await expect(saver.save(file, snapshot('Local'), baseline)).rejects.toBeInstanceOf(
      DriveConflict,
    );
    expect(api.save).toHaveBeenCalledTimes(3);
    api.save.mockReset().mockRejectedValue(new DriveAuthError());
    api.open.mockClear();
    await expect(saver.save(file, snapshot('Local'), baseline)).rejects.toBeInstanceOf(
      DriveAuthError,
    );
    expect(api.open).not.toHaveBeenCalled();
  });
  it('merges external filenames but asks on conflicting concurrent renames', () => {
    expect(
      mergeDriveSnapshots(baseline, snapshot('Local'), { content, filename: 'remote.maplet' }),
    ).toMatchObject({ filename: 'remote.maplet', conflicts: [] });
    expect(
      mergeDriveSnapshots(
        baseline,
        { content, filename: 'local.maplet' },
        { content, filename: 'remote.maplet' },
      ).conflicts[0].path,
    ).toEqual(['filename']);
  });
  it('keeps the legacy conflict behavior when there is no trusted baseline', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValueOnce(new DriveConflict());
    api.open.mockResolvedValueOnce({ ...file, version: '2', content });
    await expect(saver.save(file, snapshot('Local'), null)).rejects.toBeInstanceOf(DriveConflict);
  });
  it('includes the remote version in property conflicts for conditional resolution', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValueOnce(new DriveConflict());
    api.open.mockResolvedValueOnce({ ...file, version: '9', content: snapshot('Remote').content });
    try {
      await saver.save(file, snapshot('Local'), baseline);
      expect.fail('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(DriveMergeConflict);
      expect((error as DriveMergeConflict).remoteFile.version).toBe('9');
    }
  });
  it('reports persistent network failures as errors instead of conflicts', async () => {
    const { api, saver } = setup();
    api.save.mockRejectedValue(new DriveRequestError(503));
    api.open.mockResolvedValue({ ...file, content });
    await expect(saver.save(file, snapshot('Local'), baseline)).rejects.toBeInstanceOf(
      DriveRequestError,
    );
    expect(api.save).toHaveBeenCalledTimes(3);
  });
  it('does not retry a write after the editor switches to another document', async () => {
    const { api, saver } = setup();
    let current = true;
    api.save.mockRejectedValueOnce(new DriveConflict());
    api.open.mockImplementationOnce(async () => {
      current = false;
      return { ...file, content };
    });
    await expect(
      saver.save(file, snapshot('Local'), baseline, false, () => current),
    ).rejects.toBeInstanceOf(DriveConflict);
    expect(api.save).toHaveBeenCalledTimes(1);
  });
});
