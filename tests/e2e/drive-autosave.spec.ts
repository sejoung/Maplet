import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockGoogle } from './support/google';

async function setup(page: Page, native = false) {
  await mockGoogle(page);
  await page.clock.install();
  const original = native
    ? await readFile('tests/fixtures/native-v1.maplet', 'utf8')
    : '{"formatVersion":2,"id":"root","title":"MUP source","vendor":{"keep":true}}';
  const creates: { name: string; content: string }[] = [];
  const updates: { id: string; content: string; etag: string | undefined }[] = [];
  let version = 1;
  const state = { conflict: false };
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = { ETag: `"v${version}"`, 'Access-Control-Expose-Headers': 'ETag' };
    if (request.method() === 'POST') {
      const parts = request.postData()!.split('\r\n\r\n');
      const meta = JSON.parse(parts[1].split('\r\n')[0]);
      creates.push({ name: meta.name, content: parts[2].split('\r\n--')[0] });
      return route.fulfill({
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ id: 'native-copy', name: meta.name, version: String(version) }),
      });
    }
    if (request.method() === 'PATCH') {
      const id = url.pathname.split('/').at(-1)!;
      updates.push({ id, content: request.postData()!, etag: request.headers()['if-match'] });
      if (state.conflict) return route.fulfill({ status: 412, body: '{}' });
      version++;
      return route.fulfill({
        contentType: 'application/json',
        headers: { ...headers, ETag: `"v${version}"` },
        body: JSON.stringify({
          id,
          name: 'source.maplet',
          version: String(version),
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: url.searchParams.has('alt')
        ? original
        : JSON.stringify({
            id: 'chosen-file',
            name: native ? 'source.maplet' : 'source.mup',
            version: String(version),
            size: String(original.length),
          }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await page.getByRole('button', { name: 'Drive에서 열기', exact: true }).click();
  await page.getByRole('button', { name: '테스트 파일 선택', exact: true }).click();
  await expect(page.getByRole('treeitem').first()).toBeVisible();
  return { creates, updates, state };
}

async function rename(page: Page, title: string) {
  await page.getByRole('treeitem').first().press('F2');
  await page.getByRole('textbox', { name: '노드 제목' }).fill(title);
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await expect(page.getByRole('treeitem', { name: title, exact: true })).toBeVisible();
}

async function chooseNativeDestination(page: Page) {
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: '저장 위치 선택', exact: true }).click();
  await page.getByRole('button', { name: '테스트 폴더 선택' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('chooses a native destination once after MUP import and automatically updates only that .maplet copy', async ({
  page,
}) => {
  const { creates, updates } = await setup(page);
  await rename(page, '첫 편집');
  await page.clock.runFor(2500);
  expect(creates).toHaveLength(0);
  expect(updates).toHaveLength(0);
  await chooseNativeDestination(page);
  expect(creates).toHaveLength(1);
  expect(creates[0].name).toBe('source.maplet');
  expect(JSON.parse(creates[0].content)).toMatchObject({
    format: 'maplet',
    nodes: { root: { title: '첫 편집' } },
  });
  await rename(page, '다음 편집');
  await page.clock.runFor(500);
  await rename(page, '최종 편집');
  await page.clock.runFor(1600);
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0]).toMatchObject({ id: 'native-copy', etag: '"v1"' });
  expect(JSON.parse(updates[0].content).nodes.root.title).toBe('최종 편집');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await expect(page.locator('.save-status')).toContainText('Drive에 저장됨');
  const node = page.getByRole('treeitem');
  await node.getByRole('button', { name: '노드 크기 조절' }).press('ArrowRight');
  await page.clock.runFor(1600);
  await expect.poll(() => updates.length).toBe(2);
  expect(updates[1]).toMatchObject({ id: 'native-copy', etag: '"v2"' });
  expect(JSON.parse(updates[1].content).nodes.root.style.width).toBeGreaterThan(156);
  expect(creates).toHaveLength(1);
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
});

test('autosaves an existing native Drive file without choosing another destination', async ({
  page,
}) => {
  const { creates, updates } = await setup(page, true);
  await rename(page, 'Native autosave');
  await page.clock.runFor(1600);
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].id).toBe('chosen-file');
  expect(JSON.parse(updates[0].content).format).toBe('maplet');
  expect(creates).toHaveLength(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('pauses automatic saving on conflict and resumes after an explicit successful save', async ({
  page,
}) => {
  const { updates, state } = await setup(page);
  await chooseNativeDestination(page);
  state.conflict = true;
  await rename(page, '충돌 중 편집');
  await page.clock.runFor(1600);
  await expect(page.getByRole('dialog', { name: 'Drive 파일을 확인해 주세요.' })).toBeVisible();
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  await rename(page, '계속 편집');
  await page.clock.runFor(6000);
  expect(updates).toHaveLength(1);
  await expect(page.locator('.save-status')).toContainText('Drive 자동 저장 중지');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
  state.conflict = false;
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: 'Drive에 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await rename(page, '자동 저장 재개');
  await page.clock.runFor(1600);
  await expect.poll(() => updates.length).toBe(3);
  expect(JSON.parse(updates[2].content).nodes.root.title).toBe('자동 저장 재개');
});
