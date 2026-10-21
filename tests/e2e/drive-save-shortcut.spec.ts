import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot, waitForDriveResume } from './support/drive-workspace';
import { mockGoogle } from './support/google';
import { seedDriveWorkspace } from './support/drive-seed';

const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;

test('saves committed edits with the shortcut and File menu while keeping local downloads there too', async ({
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
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  const filename = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await filename.fill('Renamed by shortcut');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '편집 중',
  );
  await filename.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(2);
  expect(state.name).toBe('Renamed by shortcut.maplet');
  await page.getByRole('treeitem').first().press('F2');
  await page.getByRole('textbox', { name: '노드 제목', exact: true }).fill('Saved by button');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '편집 중',
  );
  // Autosave replaces a header save button; an explicit save lives in the File menu.
  await expect(page.locator('.save-button')).toHaveCount(0);
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('button', { name: '지금 저장', exact: true }).click();
  await expect.poll(() => state.updates.length).toBe(3);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Saved by button');
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '동기화 완료',
  );
});

test('shows sync errors and retries the same file from the status control after a network failure', async ({
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
  // The error state offers a retry right where the failure is shown, above the pill's hit area.
  await page.getByRole('button', { name: 'Drive 저장 다시 시도', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => state.updates.length).toBe(1);
  await expect(sync).toHaveText('동기화 완료');
  await expect(page.getByRole('button', { name: 'Drive 저장 다시 시도' })).toHaveCount(0);
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
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '다시 연결 필요',
  );
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
  await seedDriveWorkspace(page, null);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('[data-picker-view]')).toHaveCount(0);
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.keyboard.press(shortcut);
  await expect(page.getByRole('dialog', { name: 'Google Drive', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '저장 위치 선택',
  );
  expect(downloads).toEqual([]);
});
