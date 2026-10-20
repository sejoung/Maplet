import { expect, it, vi } from 'vitest';
import { DriveClient, DriveConflict } from '../../src/adapters/drive/client';

const response = (body: unknown, etag?: string) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    headers: etag ? { ETag: etag } : {},
  });
const file = { id: 'f', name: 'plan.maplet', version: '1', etag: null };

it('continues updating a newly created file when every response omits ETag', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ids: ['f'] }))
    .mockResolvedValueOnce(response(file))
    .mockResolvedValueOnce(response({ version: '1' }))
    .mockResolvedValueOnce(response({ ...file, version: '2' }))
    .mockResolvedValueOnce(response({ version: '2' }))
    .mockResolvedValueOnce(response({ ...file, version: '3' }));
  const client = new DriveClient(() => 'token', fetcher);
  const created = await client.create(file.name, '{"first":1}', 'folder');
  const saved = await client.save(created, '{"second":2}');
  expect(await client.save(saved, '{"third":3}')).toMatchObject({ id: 'f', version: '3' });
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'GET',
    'POST',
    'GET',
    'PATCH',
    'GET',
    'PATCH',
  ]);
  for (const index of [3, 5]) {
    expect(fetcher.mock.calls[index][0]).toContain('/files/f?uploadType=media');
    expect(fetcher.mock.calls[index][1].headers).not.toHaveProperty('If-Match');
  }
});

it.each([undefined, '"download-only"'])(
  'keeps saving and renaming when metadata and upload responses expose no ETag (media: %s)',
  async (mediaEtag) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ ...file, size: '2' }))
      .mockResolvedValueOnce(response('{}', mediaEtag))
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response({ ...file, version: '2' }))
      .mockResolvedValueOnce(response({ version: '2' }))
      .mockResolvedValueOnce(response({ ...file, name: 'renamed.maplet', version: '3' }));
    const client = new DriveClient(() => 'token', fetcher);
    const opened = await client.open('f');
    expect(opened.etag).toBeNull();
    const saved = await client.save(opened, '{"edit":1}');
    const renamed = await client.save(saved, '{"edit":2}', false, 'renamed.maplet');
    expect(renamed).toMatchObject({ id: 'f', version: '3', name: 'renamed.maplet', etag: null });
    for (const index of [3, 5])
      expect(fetcher.mock.calls[index][1].headers).not.toHaveProperty('If-Match');
    expect(fetcher.mock.calls[5][0]).toContain('uploadType=multipart');
  },
);

it('uses the metadata validator instead of a different content download validator', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ...file, size: '2' }, '"metadata"'))
    .mockResolvedValueOnce(response('{}', '"download"'));
  const opened = await new DriveClient(() => 'token', fetcher).open('f');
  expect(opened.etag).toBe('"metadata"');
});

it('refreshes the metadata validator before writing instead of reusing a stale stored header', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ version: '1' }, '"metadata-current"'))
    .mockResolvedValueOnce(response({ ...file, version: '2' }));
  await new DriveClient(() => 'token', fetcher).save({ ...file, etag: '"stale"' }, 'local');
  expect(fetcher.mock.calls[1][1].headers['If-Match']).toBe('"metadata-current"');
});

it('still rejects external version changes when no ETag is exposed', async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ version: '2' }));
  await expect(new DriveClient(() => 'token', fetcher).save(file, 'local')).rejects.toBeInstanceOf(
    DriveConflict,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  { stored: '1', remote: undefined },
  { stored: '', remote: '1' },
  { stored: '', remote: undefined },
])('rejects missing versions before writing: %j', async ({ stored, remote }) => {
  const fetcher = vi.fn().mockResolvedValue(response({ version: remote }));
  const result = new DriveClient(() => 'token', fetcher).save(
    { ...file, version: stored },
    'local',
  );
  await expect(result).rejects.toThrow(/버전을 확인/);
  await expect(result).rejects.not.toBeInstanceOf(DriveConflict);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
