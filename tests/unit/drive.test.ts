import { describe, expect, it, vi } from 'vitest';
import { DriveClient, DriveConflict, DriveAuthError } from '../../src/adapters/drive/client';

const response = (body: unknown, etag = '"v1"', status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ETag: etag },
  });
describe('Drive transport contracts', () => {
  it('renames and updates the same file atomically with its version and ETag checks', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response({ id: 'f', name: 'renamed.maplet', version: '2' }, '"v2"'));
    const client = new DriveClient(() => 'token', fetcher);
    const content = '{"same":"document"}';
    expect(
      await client.save(
        { id: 'f', name: 'old.maplet', version: '1', etag: '"v1"', parents: ['maps'] },
        content,
        false,
        'renamed.maplet',
      ),
    ).toMatchObject({ id: 'f', name: 'renamed.maplet', version: '2', parents: ['maps'] });
    const [url, request] = fetcher.mock.calls[1];
    expect(url).toContain('/files/f?uploadType=multipart');
    expect(request.method).toBe('PATCH');
    expect(request.headers['If-Match']).toBe('"v1"');
    const boundary = request.headers['Content-Type'].split('boundary=')[1];
    const parts = request.body.split(`--${boundary}`);
    expect(JSON.parse(parts[1].split('\r\n\r\n')[1])).toEqual({ name: 'renamed.maplet' });
    expect(parts[2].split('\r\n\r\n')[1]).toBe(content + '\r\n');
  });
  it('validates a remembered folder and rejects deleted or read-only destinations', async () => {
    const folder = {
      id: 'folder',
      name: 'Renamed maps',
      mimeType: 'application/vnd.google-apps.folder',
      capabilities: { canAddChildren: true },
    };
    const fetcher = vi.fn().mockResolvedValue(response(folder));
    const client = new DriveClient(() => 'token', fetcher);
    expect(await client.folder('folder')).toEqual({ id: 'folder', name: 'Renamed maps' });
    for (const invalid of [
      { ...folder, trashed: true },
      { ...folder, mimeType: 'application/json' },
      { ...folder, capabilities: { canAddChildren: false } },
      { ...folder, id: 'other' },
    ]) {
      fetcher.mockResolvedValueOnce(response(invalid));
      await expect(client.folder('folder')).rejects.toThrow(/폴더/);
    }
  });
  it('loads metadata and content and retains a conditional-write validator', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ id: 'f', name: 'map.mup', version: '1', size: '32', parents: ['maps'] }),
      )
      .mockResolvedValueOnce(response('{"id":1,"title":"x"}'));
    const client = new DriveClient(() => 'token', fetcher);
    expect(await client.open('f')).toMatchObject({
      id: 'f',
      etag: '"v1"',
      name: 'map.mup',
      content: '{"id":1,"title":"x"}',
      parents: ['maps'],
    });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });
  it('detects an external change before writing and never silently overwrites', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ id: 'f', version: '2' }, '"v2"'));
    const client = new DriveClient(() => 'token', fetcher);
    await expect(
      client.save({ id: 'f', name: 'x', etag: '"v1"', version: '1' }, 'local'),
    ).rejects.toBeInstanceOf(DriveConflict);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses If-Match and handles races with HTTP 412', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response('conflict', '"v2"', 412));
    const client = new DriveClient(() => 'token', fetcher);
    await expect(
      client.save({ id: 'f', name: 'x', etag: '"v1"', version: '1' }, 'local'),
    ).rejects.toBeInstanceOf(DriveConflict);
    expect(fetcher.mock.calls[1][1].headers['If-Match']).toBe('"v1"');
  });
  it('writes with a matching version even without ETag and allows explicit overwrite', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => response({ id: 'f', name: 'x', version: '1' }, ''));
    const client = new DriveClient(() => 'token', fetcher);
    expect(await client.save({ id: 'f', name: 'x', version: '1', etag: null }, 'x')).toMatchObject({
      id: 'f',
      etag: null,
    });
    expect(
      await client.save({ id: 'f', name: 'x', version: '1', etag: null }, 'x', true),
    ).toMatchObject({ id: 'f' });
  });
  it('updates validators after save and can create a separate copy', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response({ id: 'f', name: 'x', version: '2' }, '"v2"'))
      .mockResolvedValueOnce(response({ ids: ['copy'] }))
      .mockResolvedValueOnce(response({ id: 'copy', name: 'copy.mup', version: '1' }));
    const client = new DriveClient(() => 'token', fetcher);
    expect(
      await client.save({ id: 'f', name: 'x', version: '1', etag: '"v1"' }, 'x'),
    ).toMatchObject({ version: '2', etag: '"v2"' });
    expect(await client.create('copy.mup', 'x')).toMatchObject({ id: 'copy' });
  });
  it('reports auth, permission, network and oversize failures', async () => {
    const empty = new DriveClient(() => null, vi.fn());
    await expect(empty.open('x')).rejects.toBeInstanceOf(DriveAuthError);
    for (const status of [401, 403, 500]) {
      const client = new DriveClient(
        () => 'token',
        vi.fn().mockResolvedValue(response('error', '', status)),
      );
      await expect(client.open('x')).rejects.toThrow();
    }
    const large = new DriveClient(
      () => 'token',
      vi.fn().mockResolvedValue(response({ size: '99999999' })),
    );
    await expect(large.open('x')).rejects.toThrow(/크기/);
    const offline = new DriveClient(
      () => 'token',
      vi.fn().mockRejectedValue(new TypeError('offline')),
    );
    await expect(offline.open('x')).rejects.toThrow('offline');
  });
  it('creates a file in the selected folder without changing its content', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ ids: ['new'] }))
      .mockResolvedValue(response({ id: 'new', name: 'map.maplet', version: '1' }));
    const client = new DriveClient(() => 'token', fetcher);
    const content = '{"title":"keep this exactly"}';
    await client.create('map.maplet', content, 'chosen-folder');
    const request = fetcher.mock.calls[1][1];
    const boundary = request.headers['Content-Type'].split('boundary=')[1];
    const parts = request.body.split(`--${boundary}`);
    expect(JSON.parse(parts[1].split('\r\n\r\n')[1])).toEqual({
      id: 'new',
      name: 'map.maplet',
      mimeType: 'application/json',
      parents: ['chosen-folder'],
    });
    expect(parts[2].split('\r\n\r\n')[1]).toBe(content + '\r\n');
  });
});
