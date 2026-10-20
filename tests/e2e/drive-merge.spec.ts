import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot, waitForDriveResume } from './support/drive-workspace';
import AxeBuilder from '@axe-core/playwright';

const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;
const sync = (page: import('@playwright/test').Page) =>
  page.getByRole('status', { name: 'Drive 동기화 상태', exact: true });

test('coalesces frequent edits during an upload and drains only the newest snapshot automatically', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  let release!: () => void, start!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files/chosen-file?*',
    async (route) => {
      start();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await renameRoot(page, 'First snapshot');
  await page.keyboard.press(shortcut);
  await started;
  for (let i = 0; i < 12; i++) await renameRoot(page, `Latest ${i}`);
  await expect(sync(page)).not.toHaveText('동기화 완료');
  expect(state.updates).toHaveLength(0);
  release();
  await expect.poll(() => state.updates.length).toBe(1);
  await page.clock.runFor(5100);
  await expect.poll(() => state.updates.length).toBe(2);
  expect(state.updates.map((value) => JSON.parse(value).nodes[root].title)).toEqual([
    'First snapshot',
    'Latest 11',
  ]);
  await expect(sync(page)).toHaveText('동기화 완료');
  await page.clock.runFor(6000);
  expect(state.updates).toHaveLength(2);
});

test('refreshes a metadata-only version change without a conflict', async ({ page }) => {
  const { state } = await setupDriveWorkspace(page);
  state.version++;
  await renameRoot(page, 'Local title');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(state.updates).toHaveLength(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('merges separate nodes and keeps the remote change through local undo and redo', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes.left.title = 'Remote child';
  state.content = JSON.stringify(remote);
  state.version++;
  await renameRoot(page, 'My root');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  await expect(page.getByRole('treeitem', { name: 'Remote child', exact: true })).toBeVisible();
  expect(JSON.parse(state.content).nodes[root].title).toBe('My root');
  expect(JSON.parse(state.content).nodes.left.title).toBe('Remote child');
  await page
    .getByRole('button', { name: /실행 취소/, exact: false })
    .first()
    .click();
  await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Remote child', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: /다시 실행/, exact: false })
    .first()
    .click();
  await expect(page.getByRole('treeitem', { name: 'My root', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Remote child', exact: true })).toBeVisible();
});

test('merges distinct attributes of one node and an external filename change', async ({ page }) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes[root].notes = 'Remote note';
  remote.nodes[root].style.background = '#ffeedd';
  state.content = JSON.stringify(remote);
  state.name = 'Remote name.maplet';
  state.version++;
  await renameRoot(page, 'My title');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root]).toMatchObject({
    title: 'My title',
    notes: 'Remote note',
    style: { background: '#ffeedd' },
  });
  expect(state.name).toBe('Remote name.maplet');
  await expect(
    page.getByRole('button', { name: '파일 이름 변경: Remote name', exact: true }),
  ).toBeVisible();
});

test('resolves only the conflicting property and preserves non-conflicting remote attributes', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes[root].title = 'Remote title';
  remote.nodes[root].notes = 'Keep remote note';
  state.content = JSON.stringify(remote);
  state.version++;
  await renameRoot(page, 'My conflicting title');
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: '충돌한 변경 확인', exact: true });
  await expect(dialog).toBeVisible();
  await expect(sync(page)).toHaveText('동기화 충돌');
  await expect(dialog.locator('fieldset')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).include('.dialog').analyze()).violations).toEqual([]);
  await dialog.getByRole('radio', { name: /내 변경 유지/ }).check();
  await page.screenshot({ path: test.info().outputPath('merge-conflict.png'), fullPage: true });
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root]).toMatchObject({
    title: 'My conflicting title',
    notes: 'Keep remote note',
  });
  expect(state.updates).toHaveLength(1);
});

test('accepts the Drive property without a redundant upload when the result already matches', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes[root].title = 'Remote title';
  state.content = JSON.stringify(remote);
  state.version++;
  await renameRoot(page, 'Mine');
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: '충돌한 변경 확인' });
  await dialog.getByRole('radio', { name: /Drive 변경 유지/ }).check();
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(sync(page)).toHaveText('동기화 완료');
  await expect(page.getByRole('treeitem', { name: 'Remote title', exact: true })).toBeVisible();
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  expect(state.updates).toHaveLength(0);
});

test('checks the remote version again if it changes while conflict choices are open', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes[root].title = 'First remote';
  state.content = JSON.stringify(remote);
  state.version++;
  await renameRoot(page, 'Mine');
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: '충돌한 변경 확인' });
  await dialog.getByRole('radio', { name: /내 변경 유지/ }).check();
  remote.nodes[root].title = 'New remote';
  state.content = JSON.stringify(remote);
  state.version++;
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('New remote');
  expect(state.updates).toHaveLength(0);
  await dialog.getByRole('radio', { name: /내 변경 유지/ }).check();
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root].title).toBe('Mine');
});

test('restores its saved baseline and merges external changes after refreshing a local draft', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  await renameRoot(page, 'Recovered local');
  await page.clock.runFor(300);
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  const remote = JSON.parse(state.content);
  remote.nodes[root].notes = 'Remote while away';
  state.content = JSON.stringify(remote);
  state.version++;
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await waitForDriveResume(page);
  await page.clock.runFor(5100);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root]).toMatchObject({
    title: 'Recovered local',
    notes: 'Remote while away',
  });
});

test('recognizes a committed upload when the network loses its response', async ({ page }) => {
  const { state, root } = await setupDriveWorkspace(page);
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files/chosen-file?*',
    async (route) => {
      state.content = route.request().postData()!;
      state.updates.push(state.content);
      state.version++;
      await route.abort('failed');
    },
    { times: 1 },
  );
  await renameRoot(page, 'Committed with lost response');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(state.updates).toHaveLength(1);
  expect(JSON.parse(state.content).nodes[root].title).toBe('Committed with lost response');
});

test('saves periodically during continuous committed editing instead of waiting forever', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page);
  for (let i = 0; i < 31; i++) {
    await renameRoot(page, `Continuous ${i}`);
    await page.clock.runFor(500);
  }
  await expect.poll(() => state.updates.length).toBeGreaterThan(0);
  await page.clock.runFor(5100);
  await expect(sync(page)).toHaveText('동기화 완료');
});

test('reconciles its uncertain previous write after refreshing with newer unsaved edits', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  let release!: () => void, start!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files/chosen-file?*',
    async (route) => {
      state.content = route.request().postData()!;
      state.updates.push(state.content);
      state.version++;
      start();
      await held;
      await page.route(
        'https://www.googleapis.com/drive/v3/files/chosen-file?*',
        (read) => read.abort('failed'),
        { times: 1 },
      );
      await route.abort('failed');
    },
    { times: 1 },
  );
  await renameRoot(page, 'First committed');
  await page.keyboard.press(shortcut);
  await started;
  await renameRoot(page, 'Latest local');
  await page.clock.runFor(300);
  release();
  await expect(sync(page)).toHaveText('동기화 오류');
  await page.clock.runFor(300);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await waitForDriveResume(page);
  await page.clock.runFor(5100);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root].title).toBe('Latest local');
  expect(state.updates).toHaveLength(2);
});

test('finds a newly created file after its response is lost instead of creating another copy', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page, false);
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files?*',
    async (route) => {
      const parts = route.request().postData()!.split('\r\n\r\n');
      const meta = JSON.parse(parts[1].split('\r\n')[0]);
      state.content = parts[2].split('\r\n--')[0];
      state.name = meta.name;
      state.creates.push({ parents: meta.parents, name: meta.name, content: state.content });
      await route.abort('failed');
    },
    { times: 1 },
  );
  await renameRoot(page, 'Create once');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(state.creates).toHaveLength(1);
  await renameRoot(page, 'Continue same file');
  await page.keyboard.press(shortcut);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(state.creates).toHaveLength(1);
  expect(state.updates).toHaveLength(1);
});

test('preserves merged remote attributes if an upload fails and the editor is refreshed with newer edits', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const remote = JSON.parse(state.content);
  remote.nodes[root].notes = 'Preserved remote note';
  state.content = JSON.stringify(remote);
  state.version++;
  let release!: () => void, start!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files/chosen-file?*',
    async (route) => {
      state.content = route.request().postData()!;
      state.updates.push(state.content);
      state.version++;
      start();
      await held;
      await page.route(
        'https://www.googleapis.com/drive/v3/files/chosen-file?*',
        (read) => read.abort('failed'),
        { times: 1 },
      );
      await route.abort('failed');
    },
    { times: 1 },
  );
  await renameRoot(page, 'First local');
  await page.keyboard.press(shortcut);
  await started;
  await renameRoot(page, 'Latest local');
  await page.clock.runFor(300);
  release();
  await expect(sync(page)).toHaveText('동기화 오류');
  await page.clock.runFor(300);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await waitForDriveResume(page);
  await page.clock.runFor(5100);
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root]).toMatchObject({
    title: 'Latest local',
    notes: 'Preserved remote note',
  });
});
