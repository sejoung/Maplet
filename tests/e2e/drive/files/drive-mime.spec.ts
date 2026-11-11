import { test, expect, type Page } from '@playwright/test';
import { renameRoot, setupDriveWorkspace } from '../../support/drive-workspace';

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: 'Drive에서 열기', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '.maplet 파일 선택', exact: true }),
  ).toHaveAttribute('data-picker-mime-types', 'application/x-maplet+json,application/octet-stream');
  await page.getByRole('button', { name: '테스트 파일 선택', exact: true }).click();
}

test('opens a manually uploaded binary Maplet and upgrades its MIME type when saving edits', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page, false);
  state.name = 'uploaded.maplet';
  state.mimeType = 'application/octet-stream';
  await openPicker(page);
  await expect(page.getByRole('treeitem', { name: 'Drive original', exact: true })).toBeVisible();
  await renameRoot(page, 'Uploaded map edited');
  await page.clock.fastForward(5000);
  await expect.poll(() => state.updates.length).toBe(1);
  expect(state.mimeType).toBe('application/x-maplet+json');
  expect(JSON.parse(state.updates[0])).toMatchObject({ format: 'maplet' });
  expect(state.creates).toHaveLength(0);
});

for (const invalid of [
  { name: 'unrelated.bin', mimeType: 'application/octet-stream', content: null },
  { name: 'old.maplet', mimeType: 'application/json', content: null },
  {
    name: 'disguised.maplet',
    mimeType: 'application/x-maplet+json',
    content: '{"id":1,"title":"MUP"}',
  },
]) {
  test(`keeps the current map when Drive returns ${invalid.name}`, async ({ page }) => {
    const { state } = await setupDriveWorkspace(page, false);
    state.name = invalid.name;
    state.mimeType = invalid.mimeType;
    if (invalid.content) state.content = invalid.content;
    await openPicker(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
    expect(state.updates).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });
}
