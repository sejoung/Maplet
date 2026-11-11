import { expect, it, vi } from 'vitest';
import { DriveClient, DriveConflict } from '../../../../src/adapters/drive/client';

const mimeType = 'application/x-maplet+json';
const response = (body: unknown, etag = '"v1"') =>
  new Response(JSON.stringify(body), { headers: { ETag: etag } });
const file = { id: 'map', name: 'plan.maplet', version: '1', etag: '"v1"' };
const partsOf = (request: { headers: Record<string, string>; body: string }) =>
  request.body.split(`--${request.headers['Content-Type'].split('boundary=')[1]}`);

it('creates Maplet metadata and media with the dedicated type while preserving the content', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ids: ['map'] }))
    .mockResolvedValueOnce(response(file));
  const content = '{"format":"maplet","keep":"exactly"}';
  const created = await new DriveClient(() => 'token', fetcher).create(file.name, content, 'maps');
  const parts = partsOf(fetcher.mock.calls[1][1]);
  expect(JSON.parse(parts[1].split('\r\n\r\n')[1])).toMatchObject({ mimeType });
  expect(parts[1]).toContain('Content-Type: application/json; charset=UTF-8');
  expect(parts[2]).toContain(`Content-Type: ${mimeType}\r\n\r\n${content}`);
  expect(created).toMatchObject({ mimeType });
});

it.each([undefined, 'application/json', 'application/octet-stream'])(
  'upgrades an existing %s file with metadata and content in the same conditional write',
  async (previousType) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ version: '1' }))
      .mockResolvedValueOnce(response({ ...file, version: '2' }, '"v2"'));
    const saved = await new DriveClient(() => 'token', fetcher).save(
      { ...file, mimeType: previousType },
      'same native content',
    );
    const [url, request] = fetcher.mock.calls[1];
    expect(url).toContain('uploadType=multipart');
    expect(request.headers['If-Match']).toBe('"v1"');
    const parts = partsOf(request);
    expect(JSON.parse(parts[1].split('\r\n\r\n')[1])).toEqual({ name: file.name, mimeType });
    expect(parts[2]).toContain(`Content-Type: ${mimeType}\r\n\r\nsame native content`);
    expect(saved).toMatchObject({ id: 'map', mimeType, version: '2' });
  },
);

it('keeps the dedicated media type on subsequent writes without redundant metadata', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ version: '1' }))
    .mockResolvedValueOnce(response({ ...file, version: '2' }));
  await new DriveClient(() => 'token', fetcher).save({ ...file, mimeType }, 'updated');
  const [url, request] = fetcher.mock.calls[1];
  expect(url).toContain('uploadType=media');
  expect(request.headers['Content-Type']).toBe(mimeType);
  expect(request.body).toBe('updated');
});

it('requests the authoritative MIME type when opening a file', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ...file, mimeType, size: '2' }))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(response({ version: '1' }));
  expect(await new DriveClient(() => 'token', fetcher).open('map')).toMatchObject({ mimeType });
  const fields = new URL(fetcher.mock.calls[0][0]).searchParams.get('fields')!.split(',');
  expect(fields).toContain('mimeType');
});

it('does not migrate a file if its version changed remotely', async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ version: '2' }));
  await expect(new DriveClient(() => 'token', fetcher).save(file, 'local')).rejects.toBeInstanceOf(
    DriveConflict,
  );
  expect(fetcher).toHaveBeenCalledOnce();
});
