import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot, waitForDriveResume } from './support/drive-workspace';
import { mockGoogle } from './support/google';

const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;

test('saves immediately to Drive with the shortcut and keeps local downloads in the File menu', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  const sync = page.getByRole('status', { name: 'Drive 동기화 상태', exact: true });
  await expect(sync).toHaveText('동기화 완료');
  await renameRoot(page, 'Save with shortcut');
  await expect(sync).toHaveText('저장 대기');
  await page.keyboard.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Save with shortcut');
  await expect(sync).toHaveText('동기화 완료');
  expect(downloads).toEqual([]);
  await page.getByRole('button', { name: '파일', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 다운로드', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('source.maplet');
  expect(state.updates).toHaveLength(1);
});

test('commits edited filenames and node titles before saving from the shortcut or primary button', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  const filename = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await filename.fill('Renamed by shortcut');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '편집 중',
  );
  await filename.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(state.name).toBe('Renamed by shortcut.maplet');
  await page.getByRole('treeitem').first().press('F2');
  await page.getByRole('textbox', { name: '노드 제목', exact: true }).fill('Saved by button');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '편집 중',
  );
  await page.locator('.save-button').click();
  await expect.poll(() => state.updates.length).toBe(2);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Saved by button');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '동기화 완료',
  );
});

test('queues the latest manual save during an upload and never marks stale content as synced', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files/chosen-file?*',
    async (route) => {
      started();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await renameRoot(page, 'First saved content');
  await page.keyboard.press(shortcut);
  await requested;
  const sync = page.getByRole('status', { name: 'Drive 동기화 상태', exact: true });
  await expect(sync).toHaveText('저장 중');
  await renameRoot(page, 'New edit during save');
  await page.keyboard.press(shortcut);
  await expect(sync).not.toHaveText('동기화 완료');
  release();
  await expect.poll(() => state.updates.length).toBe(2);
  expect(state.updates.map((content) => JSON.parse(content).nodes[root].title)).toEqual([
    'First saved content',
    'New edit during save',
  ]);
  await expect(sync).toHaveText('동기화 완료');
  await page.clock.runFor(3000);
  expect(state.updates).toHaveLength(2);
});

test('shows sync errors and retries the same file with the shortcut after a network failure', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  await renameRoot(page, 'Keep local work');
  state.authStatus = 500;
  await page.keyboard.press(shortcut);
  const sync = page.getByRole('status', { name: 'Drive 동기화 상태', exact: true });
  await expect(sync).toHaveText('동기화 오류');
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toBeVisible();
  expect(state.updates).toHaveLength(0);
  await page.getByRole('button', { name: '대화상자 닫기', exact: true }).click();
  state.authStatus = 200;
  await page.keyboard.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(1);
  await expect(sync).toHaveText('동기화 완료');
});

test('shows conflicts and keeps local work when the shortcut encounters a changed remote version', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  await renameRoot(page, 'Conflicting local edit');
  const remote = JSON.parse(state.content);
  remote.nodes[remote.roots[0]].title = 'External change';
  state.content = JSON.stringify(remote);
  state.version++;
  await page.keyboard.press(shortcut);
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '동기화 충돌',
  );
  await expect(page.getByRole('dialog', { name: '충돌한 변경 확인' })).toBeVisible();
  expect(state.updates).toHaveLength(0);
  await expect(
    page.getByRole('treeitem', { name: 'Conflicting local edit', exact: true }),
  ).toBeVisible();
});

test('requires explicit reconnection after refresh before saving with the shortcut', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  await page.clock.runFor(300);
  await page.reload();
  await page.keyboard.press(shortcut);
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await waitForDriveResume(page);
  await renameRoot(page, 'After refresh shortcut');
  await page.keyboard.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
});

test('asks for a save folder rather than downloading when authorization has no destination', async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await page.getByRole('button', { name: '저장 위치 선택', exact: true }).click();
  await page.getByRole('button', { name: '선택 취소', exact: true }).click();
  await page.getByRole('button', { name: '대화상자 닫기', exact: true }).click();
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.keyboard.press(shortcut);
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '저장 위치 선택',
  );
  expect(downloads).toEqual([]);
});
