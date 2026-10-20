import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot } from './support/drive-workspace';

test('queues the latest manual save during an upload and never marks stale content as synced', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;
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
