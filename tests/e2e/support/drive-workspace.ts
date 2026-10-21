import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockGoogle } from './google';
import { seedDriveWorkspace } from './drive-seed';

export async function setupDriveWorkspace(
  page: Page,
  openFile = true,
  validators: 'all' | 'missing' | 'download-only' | 'upload-missing' = 'all',
  folderName = 'Maplet 작업 폴더',
) {
  await mockGoogle(page);
  await page.clock.install();
  const document = JSON.parse(await readFile('tests/fixtures/native-v1.maplet', 'utf8'));
  const root = document.roots[0];
  document.nodes[root].title = 'Drive original';
  const state = {
    content: JSON.stringify(document),
    name: 'source.maplet',
    version: 1,
    versionAvailable: true,
    folderAvailable: true,
    authStatus: 200,
    reads: [] as string[],
    updates: [] as string[],
    creates: [] as { parents: string[]; content: string; name: string }[],
  };
  // Context-wide so tabs opened by a test share the same Drive.
  await page.context().route('https://www.googleapis.com/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (state.authStatus !== 200) return route.fulfill({ status: state.authStatus, body: '{}' });
    if (url.pathname.endsWith('/generateIds'))
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ids: [state.creates.length ? `new-file-${state.creates.length + 1}` : 'new-file'],
        }),
      });
    if (request.method() === 'GET') state.reads.push(url.href);
    const metadataEtag =
      validators === 'all' || (validators === 'upload-missing' && request.method() === 'GET');
    const headers: Record<string, string> = metadataEtag
      ? { ETag: `"v${state.version}"`, 'Access-Control-Expose-Headers': 'ETag' }
      : {};
    if (validators === 'download-only' && url.searchParams.has('alt')) {
      headers.ETag = '"download-validator"';
      headers['Access-Control-Expose-Headers'] = 'ETag';
    }
    if (url.pathname.endsWith('/chosen-folder'))
      return route.fulfill(
        state.folderAvailable
          ? {
              contentType: 'application/json',
              headers,
              body: JSON.stringify({
                id: 'chosen-folder',
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                capabilities: { canAddChildren: true },
              }),
            }
          : { status: 404, body: '{}' },
      );
    if (request.method() === 'PATCH') {
      const expected =
        validators === 'all' || validators === 'upload-missing' ? `"v${state.version}"` : undefined;
      if (request.headers()['if-match'] !== expected)
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
        headers: metadataEtag ? { ...headers, ETag: `"v${state.version}"` } : headers,
        body: JSON.stringify({
          id: url.pathname.split('/').at(-1),
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
      state.content = state.creates.at(-1)!.content;
      state.name = meta.name;
      state.version = 1;
      return route.fulfill({
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ id: meta.id, name: meta.name, version: '1' }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: url.searchParams.has('alt')
        ? state.content
        : JSON.stringify({
            id: url.pathname.split('/').at(-1),
            name: state.name,
            ...(state.versionAvailable ? { version: String(state.version) } : {}),
            size: String(state.content.length),
            parents: ['chosen-folder'],
          }),
    });
  });
  await seedDriveWorkspace(page, {
    folder: { id: 'chosen-folder', name: folderName },
    file: openFile
      ? {
          id: 'chosen-file',
          name: state.name,
          version: '1',
          etag: validators === 'all' || validators === 'upload-missing' ? '"v1"' : null,
          parents: ['chosen-folder'],
        }
      : null,
    source: null,
  });
  await page.goto('/');
  await expect(page.locator('.drive-button.connected')).toBeEnabled();
  if (openFile) {
    await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  }
  page.on('dialog', (dialog) => dialog.accept());
  return { state, root };
}
export async function renameRoot(page: Page, title: string) {
  await page.getByRole('treeitem').first().press('F2');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill(title);
  await editor.press('Enter');
}
export async function waitForDriveResume(page: Page) {
  await expect(page.getByRole('button', { name: /^Google Drive 연결(됨)?$/ })).toBeEnabled();
  const disconnected = page.getByRole('button', { name: 'Google Drive 연결', exact: true });
  if (await disconnected.count()) {
    await disconnected.click();
    await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  }
  await expect(page.locator('.save-status')).not.toContainText('Drive 다시 연결 필요');
  await expect(page.locator('.drive-button.connected')).toBeEnabled();
}

export async function renameDriveFile(page: Page, name: string) {
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  const input = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await input.fill(name);
  await input.press('Enter');
}
