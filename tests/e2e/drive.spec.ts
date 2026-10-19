import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockGoogle } from './support/google';

test('continues sign-in directly into file selection and opens the selected map', async ({
  page,
}) => {
  await mockGoogle(page);
  const content = await readFile('tests/fixtures/native-v1.maplet', 'utf8');
  await page.route('https://www.googleapis.com/drive/v3/files/**', (route) => {
    const media = new URL(route.request().url()).searchParams.has('alt');
    return route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"v1"', 'Access-Control-Expose-Headers': 'ETag' },
      body: media
        ? content
        : JSON.stringify({
            id: 'chosen-file',
            name: 'opened.maplet',
            version: '1',
            size: String(content.length),
          }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google에 연결', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Drive에서 열기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '열 파일 선택', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '테스트 파일 선택' }).click();
  await expect(page.getByRole('treeitem', { name: 'Maplet document', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
});

test('selects a destination folder before saving and does not write when selection is cancelled', async ({
  page,
}) => {
  await mockGoogle(page);
  const created: { name: string; parents: string[] }[] = [];
  const updates: string[] = [];
  await page.route('https://www.googleapis.com/**', (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      created.push(JSON.parse(request.postData()!.split('\r\n\r\n')[1].split('\r\n')[0]));
    }
    if (request.method() === 'PATCH') updates.push(request.url());
    return route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"v1"', 'Access-Control-Expose-Headers': 'ETag' },
      body: JSON.stringify({ id: 'created', name: created.at(-1)?.name, version: '1' }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await page.getByRole('button', { name: '저장 위치 선택', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '저장할 폴더 선택' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '선택 취소' }).click();
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toBeVisible();
  expect(created).toHaveLength(0);
  await page.getByRole('button', { name: '저장 위치 선택', exact: true }).click();
  await page.getByRole('button', { name: '테스트 폴더 선택' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(created).toMatchObject([{ name: '제목 없음.maplet', parents: ['chosen-folder'] }]);
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: 'Drive에 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(updates).toHaveLength(1);
  expect(created).toHaveLength(1);
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: '다른 위치에 새 사본 저장', exact: true }).click();
  await page.getByRole('button', { name: '테스트 폴더 선택' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(created[1]).toMatchObject({ name: '제목 없음 (사본).maplet', parents: ['chosen-folder'] });
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
});

test('opens, updates and creates Drive files with the native browser fetch', async ({ page }) => {
  const requests: { method: string; path: string; authorization: string | undefined }[] = [];
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: url.pathname + url.search,
      authorization: request.headers().authorization,
    });
    const body =
      request.method() === 'POST'
        ? { id: 'copy', name: 'copy.maplet', version: '1' }
        : request.method() === 'PATCH'
          ? { id: 'file', name: 'map.maplet', version: '2' }
          : url.searchParams.get('alt') === 'media'
            ? 'Drive file content'
            : { id: 'file', name: 'map.maplet', version: '1', size: '18' };
    await route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"v1"', 'Access-Control-Expose-Headers': 'ETag' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/adapters/drive/client.ts';
    const { DriveClient } = await import(modulePath);
    const client = new DriveClient(() => 'test-token');
    const opened = await client.open('file');
    const saved = await client.save(opened, 'Updated content');
    const created = await client.create('copy.maplet', 'Copy content');
    return { opened, saved, created };
  });
  expect(result.opened).toMatchObject({
    id: 'file',
    name: 'map.maplet',
    content: 'Drive file content',
    etag: '"v1"',
  });
  expect(result.saved).toMatchObject({ id: 'file', version: '2' });
  expect(result.created).toMatchObject({ id: 'copy', name: 'copy.maplet' });
  expect(requests).toEqual([
    {
      method: 'GET',
      path: '/drive/v3/files/file?fields=id,name,version,size',
      authorization: 'Bearer test-token',
    },
    {
      method: 'GET',
      path: '/drive/v3/files/file?alt=media',
      authorization: 'Bearer test-token',
    },
    {
      method: 'GET',
      path: '/drive/v3/files/file?fields=version',
      authorization: 'Bearer test-token',
    },
    {
      method: 'PATCH',
      path: '/upload/drive/v3/files/file?uploadType=media&fields=id,name,version',
      authorization: 'Bearer test-token',
    },
    {
      method: 'POST',
      path: '/upload/drive/v3/files?uploadType=multipart&fields=id,name,version',
      authorization: 'Bearer test-token',
    },
  ]);
});
