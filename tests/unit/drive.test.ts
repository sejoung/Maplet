import { describe, expect, it, vi } from 'vitest';
import { DriveClient, DriveConflict, DriveAuthError } from '../../src/adapters/drive/client';

const response = (body: unknown, etag = '"v1"', status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ETag: etag },
  });
describe('Drive transport contracts', () => {
  it('loads metadata and content and retains a conditional-write validator', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'f', name: 'map.mup', version: '1', size: '32' }))
      .mockResolvedValueOnce(response('{"id":1,"title":"x"}'));
    const client = new DriveClient(() => 'token', fetcher);
    expect(await client.open('f')).toMatchObject({
      id: 'f',
      etag: '"v1"',
      name: 'map.mup',
      content: '{"id":1,"title":"x"}',
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
  it('writes successfully, refuses unverifiable overwrites and allows explicit overwrite', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => response({ id: 'f', name: 'x', version: '1' }, ''));
    const client = new DriveClient(() => 'token', fetcher);
    await expect(
      client.save({ id: 'f', name: 'x', version: '1', etag: null }, 'x'),
    ).rejects.toThrow(/검증/);
    expect(
      await client.save({ id: 'f', name: 'x', version: '1', etag: null }, 'x', true),
    ).toMatchObject({ id: 'f' });
  });
  it('updates validators after save and can create a separate copy', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response({ id: 'f', name: 'x', version: '2' }, '"v2"'))
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
});
