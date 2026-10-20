import { test, expect, type Page } from '@playwright/test';
import { setupDriveWorkspace, renameRoot } from './support/drive-workspace';

const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;
async function freeze(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000).toISOString()));
}

test('keeps a fast local draft and batches twenty edits into one upload and one fresh version check', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  await freeze(page);
  const reads = state.reads.length;
  for (let i = 0; i < 20; i++) {
    await renameRoot(page, `Buffered edit ${i}`);
    await page.clock.runFor(100);
  }
  await page.clock.runFor(250);
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  expect(state.updates).toHaveLength(0);
  expect(state.reads).toHaveLength(reads);
  await page.clock.runFor(3000);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Buffered edit 19');
  expect(state.reads.length - reads).toBe(1);
});

test('coalesces edits two seconds apart without issuing requests between edits', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  await freeze(page);
  const reads = state.reads.length;
  for (let i = 0; i < 6; i++) {
    await renameRoot(page, `Spaced edit ${i}`);
    await page.clock.runFor(2000);
    expect(state.updates).toHaveLength(0);
    expect(state.reads).toHaveLength(reads);
  }
  await page.clock.runFor(999);
  expect(state.updates).toHaveLength(0);
  await page.clock.runFor(1);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(state.reads.length - reads).toBe(1);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Spaced edit 5');
});

test('spaces automatic uploads five seconds apart and lets manual save flush the buffer immediately', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  await freeze(page);
  await renameRoot(page, 'Manual first');
  await page.keyboard.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(1);
  for (let i = 0; i < 10; i++) await renameRoot(page, `Queued ${i}`);
  await page.clock.runFor(4999);
  expect(state.updates).toHaveLength(1);
  await page.clock.runFor(1);
  await expect.poll(() => state.updates.length).toBe(2);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Queued 9');
  await renameRoot(page, 'Flush now');
  await page.keyboard.press(shortcut);
  await expect.poll(() => state.updates.length).toBe(3);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Flush now');
  await page.clock.runFor(16000);
  expect(state.updates).toHaveLength(3);
});

test('drops reverted edits and repeated unchanged saves before issuing any Drive request', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  await freeze(page);
  const reads = state.reads.length;
  await renameRoot(page, 'Temporary edit');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await page.clock.runFor(16000);
  for (let i = 0; i < 3; i++) await page.keyboard.press(shortcut);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Drive에 저장', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(state.reads).toHaveLength(reads);
  expect(state.updates).toHaveLength(0);
});
