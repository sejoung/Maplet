import { expect, it, vi } from 'vitest';
import { DriveClient, DriveConflict } from '../../src/adapters/drive/client';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const metadata = {
  id: 'reserved',
  name: 'map.maplet',
  version: '1',
  parents: ['folder'],
  size: '1',
};
it('uses the reserved ID to find a successful creation whose response was lost', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ids: ['reserved'] }))
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockResolvedValueOnce(response(metadata))
    .mockResolvedValueOnce(new Response('content'));
  const client = new DriveClient(() => 'token', fetcher);
  expect(await client.create('map.maplet', 'content', 'folder', 'operation')).toMatchObject({
    id: 'reserved',
  });
  expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
});
it('reuses the same reserved ID across manual retries and updates newer edits after finding its own creation', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ids: ['reserved'] }))
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockRejectedValueOnce(new TypeError('Offline'));
  const client = new DriveClient(() => 'token', fetcher);
  await expect(client.create('map.maplet', 'first', 'folder', 'operation')).rejects.toThrow(
    'Offline',
  );
  fetcher
    .mockResolvedValueOnce(response({}, 409))
    .mockResolvedValueOnce(response(metadata))
    .mockResolvedValueOnce(new Response('first'))
    .mockResolvedValueOnce(response({ version: '1' }))
    .mockResolvedValueOnce(response({ ...metadata, name: 'new.maplet', version: '2' }));
  expect(await client.create('new.maplet', 'latest', 'folder', 'operation')).toMatchObject({
    id: 'reserved',
    version: '2',
  });
  const posts = fetcher.mock.calls.filter(([, init]) => init.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts.every(([, init]) => init.body.includes('"id":"reserved"'))).toBe(true);
  expect(fetcher.mock.calls.filter(([url]) => url.includes('generateIds'))).toHaveLength(1);
});
it('does not replace a created file that was subsequently edited elsewhere', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ids: ['reserved'] }))
    .mockResolvedValueOnce(response({}, 409))
    .mockResolvedValueOnce(response(metadata))
    .mockResolvedValueOnce(new Response('external change'));
  const client = new DriveClient(() => 'token', fetcher);
  await expect(client.create('map.maplet', 'mine', 'folder', 'operation')).rejects.toBeInstanceOf(
    DriveConflict,
  );
  expect(fetcher.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false);
});
