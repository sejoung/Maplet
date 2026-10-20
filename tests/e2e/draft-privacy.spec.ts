import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { renameRoot } from './support/drive-workspace';

const label = '이 기기에 편집 초안 보관';
async function settings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('checkbox', { name: label, exact: true });
}

test('disabling device drafts deletes the saved draft and pending writes while keeping the current map', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await renameRoot(page, 'Private map');
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  const checkbox = await settings(page);
  await expect(checkbox).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await checkbox.uncheck();
  await expect(checkbox).toBeEnabled();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Private map', exact: true })).toBeVisible();
  await expect(page.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  await renameRoot(page, 'Still private');
  await page.reload();
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
  await expect(await settings(page)).not.toBeChecked();
  await page.getByRole('checkbox', { name: label, exact: true }).check();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await renameRoot(page, 'Keep this draft');
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toBeVisible();
});

test('applies draft privacy changes to another open tab', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await renameRoot(other, 'Other tab private content');
  await expect(other.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  await (await settings(page)).uncheck();
  await expect(other.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  await renameRoot(other, 'New private edit');
  other.on('dialog', (dialog) => dialog.accept());
  await other.reload();
  await expect(other.getByRole('button', { name: '초안 복구', exact: true })).toHaveCount(0);
  await other.close();
});
