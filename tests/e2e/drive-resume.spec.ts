import { test, expect } from '@playwright/test';
import {
  setupDriveWorkspace as setup,
  renameRoot as rename,
  renameDriveFile as renameFile,
  waitForDriveResume as reconnect,
} from './support/drive-workspace';

for (const validators of ['missing', 'download-only', 'upload-missing'] as const) {
  test(`continues autosaving and renaming the same file without upload ETags: ${validators}`, async ({
    page,
  }) => {
    const { state, root } = await setup(page, true, validators);
    await rename(page, 'First edit');
    await page.clock.runFor(1600);
    await expect.poll(() => state.updates.length).toBe(1);
    await rename(page, 'Second edit');
    await page.clock.runFor(1600);
    await expect.poll(() => state.updates.length).toBe(2);
    await renameFile(page, 'Renamed');
    await page.clock.runFor(1600);
    await expect.poll(() => state.updates.length).toBe(3);
    expect(state.name).toBe('Renamed.maplet');
    expect(state.creates).toHaveLength(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
    await page.clock.runFor(300);
    await page.reload();
    await reconnect(page);
    await expect(page.getByRole('treeitem', { name: 'Second edit', exact: true })).toBeVisible();
    await rename(page, 'After reconnect');
    await page.clock.runFor(1600);
    await expect.poll(() => state.updates.length).toBe(4);
    expect(JSON.parse(state.content).nodes[root].title).toBe('After reconnect');
    expect(state.creates).toHaveLength(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('still pauses on external changes when ETags are absent', async ({ page }) => {
  const { state } = await setup(page, true, 'missing');
  const remote = JSON.parse(state.content);
  remote.nodes[remote.roots[0]].title = 'External title';
  state.content = JSON.stringify(remote);
  state.version++;
  await rename(page, 'Local changes');
  await page.clock.runFor(1600);
  await expect(page.getByRole('dialog', { name: '충돌한 변경 확인' })).toBeVisible();
  expect(state.updates).toHaveLength(0);
  await expect(page.getByRole('treeitem', { name: 'Local changes', exact: true })).toBeVisible();
});

test('treats missing versions as a save error without claiming an external conflict', async ({
  page,
}) => {
  const { state } = await setup(page, true, 'missing');
  state.versionAvailable = false;
  await rename(page, 'Unsaved local work');
  await page.clock.runFor(1600);
  await expect(page.locator('.save-status')).toContainText('Drive 자동 저장 중지');
  expect(state.updates).toHaveLength(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('버전을 확인하지 못했습니다');
  await expect(
    page.getByRole('treeitem', { name: 'Unsaved local work', exact: true }),
  ).toBeVisible();
});

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
  state.name = 'External name.maplet';
  state.version++;
  await page.clock.runFor(1600);
  await expect(page.getByRole('dialog', { name: '충돌한 변경 확인' })).toBeVisible();
  expect(state.name).toBe('External name.maplet');
  expect(state.updates).toHaveLength(0);
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('충돌 중 이름');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
});

test('automatically restores the folder and file after reload without reauthorization', async ({
  page,
}) => {
  const { state, root } = await setup(page);
  await page.clock.runFor(300);
  await page.reload();
  await reconnect(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.updates).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
  await rename(page, 'Edit after reload');
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(JSON.parse(state.updates[0]).nodes[root].title).toBe('Edit after reload');
  expect(state.creates).toHaveLength(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
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
  const remote = JSON.parse(state.content);
  remote.nodes[root].title = 'Someone else edited';
  state.content = JSON.stringify(remote);
  state.version++;
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await reconnect(page);
  await expect(page.getByRole('dialog', { name: '충돌한 변경 확인' })).toBeVisible();
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
  state.folderAvailable = false;
  await page.reload();
  await expect(page.locator('.save-status')).toContainText('Drive 다시 연결 필요');
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('404');
  await expect(
    page
      .getByRole('dialog', { name: 'Google Drive', exact: true })
      .getByRole('button', { name: 'Drive에 저장', exact: true }),
  ).toBeDisabled();
  await page.clock.runFor(4000);
  expect(state.updates).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
});
