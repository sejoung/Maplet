import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot, waitForDriveResume } from './support/drive-workspace';

const sessionKey = 'maplet:drive-session:public-test-client';

test('asks for reconnection only after the remembered authentication expires', async ({ page }) => {
  const { state } = await setupDriveWorkspace(page);
  await page.evaluate((key) => {
    const session = JSON.parse(sessionStorage.getItem(key)!);
    session.expiresAt = Date.now() - 1;
    sessionStorage.setItem(key, JSON.stringify(session));
  }, sessionKey);
  await page.reload();
  await expect(page.locator('.save-status')).toContainText('Drive 다시 연결 필요');
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), sessionKey)).toBeNull();
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Maplet 작업 폴더');
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await waitForDriveResume(page);
  await expect(page.locator('html')).toHaveAttribute('data-authorizations', '1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await renameRoot(page, 'After expired session');
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
});

test('clears a revoked session without opening a login popup or retrying automatically', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  state.authStatus = 401;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google Drive 연결', exact: true })).toBeEnabled();
  await expect(page.locator('.save-status')).toContainText('Drive 다시 연결 필요');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), sessionKey)).toBeNull();
  await page.clock.runFor(6000);
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.updates).toHaveLength(0);
  state.authStatus = 200;
  await page.getByRole('button', { name: 'Google Drive 연결', exact: true }).click();
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await waitForDriveResume(page);
  await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
});

test('waits for the recovery decision before accessing or restoring a remembered Drive document', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  await renameRoot(page, 'Local unsaved draft');
  await page.clock.runFor(300);
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  const reads = state.reads.length;
  await page.reload();
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toBeVisible();
  await page.clock.runFor(4000);
  expect(state.reads).toHaveLength(reads);
  expect(state.updates).toHaveLength(0);
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await waitForDriveResume(page);
  await expect(
    page.getByRole('treeitem', { name: 'Local unsaved draft', exact: true }),
  ).toBeVisible();
  await page.clock.runFor(1600);
  await expect.poll(() => state.updates.length).toBe(1);
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
});

test('keeps edits made while automatic restoration is waiting for Drive', async ({ page }) => {
  const { state } = await setupDriveWorkspace(page);
  await page.clock.runFor(300);
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(
    'https://www.googleapis.com/drive/v3/files/chosen-file?*',
    async (route) => {
      started();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await page.reload();
  await requested;
  await renameRoot(page, 'Typing while connecting');
  release();
  await expect(
    page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('treeitem', { name: 'Typing while connecting', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Drive 다시 연결 필요');
  await page.clock.runFor(4000);
  expect(state.updates).toHaveLength(0);
});

test('does not restore an explicitly disconnected session after another refresh', async ({
  page,
}) => {
  await setupDriveWorkspace(page);
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), sessionKey)).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google Drive 연결', exact: true })).toBeEnabled();
  await expect(page.locator('html')).not.toHaveAttribute('data-authorizations');
  await expect(page.locator('.save-status')).not.toContainText('Drive');
});
