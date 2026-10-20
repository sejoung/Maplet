import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockGoogle } from './support/google';

async function setup(page: Page, openFile = true) {
  await mockGoogle(page);
  await page.clock.install();
  const document = JSON.parse(await readFile('tests/fixtures/native-v1.maplet', 'utf8'));
  const root = document.roots[0];
  document.nodes[root].title = 'Drive original';
  const state = {
    content: JSON.stringify(document),
    name: 'source.maplet',
    version: 1,
    folderAvailable: true,
    updates: [] as string[],
    creates: [] as { parents: string[]; content: string; name: string }[],
  };
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = { ETag: `"v${state.version}"`, 'Access-Control-Expose-Headers': 'ETag' };
    if (url.pathname.endsWith('/chosen-folder'))
      return route.fulfill(
        state.folderAvailable
          ? {
              contentType: 'application/json',
              headers,
              body: JSON.stringify({
                id: 'chosen-folder',
                name: 'Maplet 작업 폴더',
                mimeType: 'application/vnd.google-apps.folder',
                capabilities: { canAddChildren: true },
              }),
            }
          : { status: 404, body: '{}' },
      );
    if (request.method() === 'PATCH') {
      if (request.headers()['if-match'] !== `"v${state.version}"`)
        return route.fulfill({ status: 412, body: '{}' });
      let content = request.postData()!;
      if (url.searchParams.get('uploadType') === 'multipart') {
        const parts = content.split('\r\n\r\n');
        state.name = JSON.parse(parts[1].split('\r\n')[0]).name;
        content = parts[2].split('\r\n--')[0];
      }
      state.updates.push(content);
      state.content = content;
      state.version++;
      return route.fulfill({
        contentType: 'application/json',
        headers: { ...headers, ETag: `"v${state.version}"` },
        body: JSON.stringify({
          id: 'chosen-file',
          name: state.name,
          version: String(state.version),
        }),
      });
    }
    if (request.method() === 'POST') {
      const parts = request.postData()!.split('\r\n\r\n');
      const meta = JSON.parse(parts[1].split('\r\n')[0]);
      state.creates.push({
        parents: meta.parents,
        content: parts[2].split('\r\n--')[0],
        name: meta.name,
      });
      return route.fulfill({
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ id: 'new-file', name: meta.name, version: '1' }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: url.searchParams.has('alt')
        ? state.content
        : JSON.stringify({
            id: 'chosen-file',
            name: state.name,
            version: String(state.version),
            size: String(state.content.length),
            parents: ['chosen-folder'],
          }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await page.getByRole('button', { name: '저장 위치 선택', exact: true }).click();
  await page.getByRole('button', { name: '테스트 폴더 선택', exact: true }).click();
  if (openFile) {
    await page.getByRole('button', { name: 'Drive에서 열기', exact: true }).click();
    await page.getByRole('button', { name: '테스트 파일 선택', exact: true }).click();
    await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  } else await page.getByRole('button', { name: '대화상자 닫기', exact: true }).click();
  page.on('dialog', (dialog) => dialog.accept());
  return { state, root };
}
async function rename(page: Page, title: string) {
  await page.getByRole('treeitem').first().press('F2');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill(title);
  await editor.press('Enter');
}
async function reconnect(page: Page) {
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toContainText(
    'Maplet 작업 폴더',
  );
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
}

async function renameFile(page: Page, name: string) {
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  const input = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await input.fill(name);
  await input.press('Enter');
}

test('creates a Drive file with the edited filename without changing node titles', async ({
  page,
}) => {
  const { state } = await setup(page, false);
  await renameFile(page, '업무 계획');
  await page.clock.runFor(1600);
  await expect.poll(() => state.creates.length).toBe(1);
  expect(state.creates[0].name).toBe('업무 계획.maplet');
  expect(state.creates[0].parents).toEqual(['chosen-folder']);
  const document = JSON.parse(state.creates[0].content);
  expect(document.nodes[document.roots[0]].title).toBe('중심 주제');
});

test('recovers a filename-only edit and renames the same Drive file after reconnecting', async ({
  page,
}) => {
  const { state, root } = await setup(page);
  await renameFile(page, '변경한 파일');
  await page.clock.runFor(300);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('변경한 파일');
  await reconnect(page);
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(state.name).toBe('변경한 파일.maplet');
  expect(JSON.parse(state.content).nodes[root].title).toBe('Drive original');
  expect(state.creates).toHaveLength(0);
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await page.clock.runFor(300);
  await page.reload();
  await reconnect(page);
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('변경한 파일');
  await page.clock.runFor(2000);
  expect(state.updates).toHaveLength(1);
});

test('checks the remote version before renaming a Drive file', async ({ page }) => {
  const { state } = await setup(page);
  await renameFile(page, '충돌 중 이름');
  state.version++;
  await page.clock.runFor(1600);
  await expect(page.getByRole('dialog', { name: 'Drive 파일을 확인해 주세요.' })).toBeVisible();
  expect(state.name).toBe('source.maplet');
  expect(state.updates).toHaveLength(0);
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('충돌 중 이름');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
});

test('remembers the folder and file after reload, reauthorizes once and continues saving the same file', async ({
  page,
}) => {
  const { state, root } = await setup(page);
  await page.clock.runFor(300);
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  await expect(page.locator('.save-status')).toContainText('Drive 다시 연결 필요');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Google Drive', exact: true });
  await expect(dialog).toContainText('source.maplet');
  await expect(dialog).toContainText('Maplet 작업 폴더');
  await expect(page.getByRole('button', { name: 'Drive에 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.updates).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
  await rename(page, 'Edit after reload');
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(JSON.parse(state.updates[0]).nodes[root].title).toBe('Edit after reload');
  expect(state.creates).toHaveLength(0);
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain('browser-test-token');
  expect(stored).not.toContain('Edit after reload');
});

test('recovers unsaved local edits after reload and resumes their original Drive target', async ({
  page,
}) => {
  const { state, root } = await setup(page);
  await rename(page, 'Recovered local edit');
  await page.clock.runFor(300);
  expect(state.updates).toHaveLength(0);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect(
    page.getByRole('treeitem', { name: 'Recovered local edit', exact: true }),
  ).toBeVisible();
  await reconnect(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('treeitem', { name: 'Recovered local edit', exact: true }),
  ).toBeVisible();
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(JSON.parse(state.updates[0]).nodes[root].title).toBe('Recovered local edit');
  expect(state.creates).toHaveLength(0);
});

test('pauses on a remote change without overwriting the recovered draft or Drive file', async ({
  page,
}) => {
  const { state, root } = await setup(page);
  await rename(page, 'Local work');
  await page.clock.runFor(300);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  const remote = JSON.parse(state.content);
  remote.nodes[root].title = 'Someone else edited';
  state.content = JSON.stringify(remote);
  state.version++;
  await reconnect(page);
  await expect(page.getByRole('dialog', { name: 'Drive 파일을 확인해 주세요.' })).toBeVisible();
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Local work', exact: true })).toBeVisible();
  await page.clock.runFor(6000);
  expect(state.updates).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Someone else edited');
});

test('remembers a folder without creating a file until an edit after reconnecting', async ({
  page,
}) => {
  const { state } = await setup(page, false);
  await page.reload();
  await reconnect(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.runFor(4000);
  expect(state.creates).toHaveLength(0);
  await rename(page, 'First local edit');
  await page.clock.runFor(1600);
  await expect.poll(() => state.creates.length).toBe(1);
  expect(state.creates[0].parents).toEqual(['chosen-folder']);
  expect(state.creates[0].name).toBe('First local edit.maplet');
});

test('forgets the remembered destination after explicit disconnect', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await expect(page.getByRole('button', { name: '다시 연결', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '저장 위치 선택', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('source.maplet');
});

test('keeps autosave paused if the remembered folder is unavailable', async ({ page }) => {
  const { state } = await setup(page);
  await page.reload();
  state.folderAvailable = false;
  await reconnect(page);
  await expect(page.getByRole('alert')).toContainText('404');
  await expect(page.getByRole('button', { name: 'Drive에 저장', exact: true })).toBeDisabled();
  await page.clock.runFor(4000);
  expect(state.updates).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
});
