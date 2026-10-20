import { test, expect } from '@playwright/test';
import { auditAccessibility } from './support/accessibility';
import { renameRoot } from './support/drive-workspace';

const label = '이 기기에 편집 초안 보관';
async function settings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('checkbox', { name: label, exact: true });
}

test('disabling device drafts deletes the saved draft and pending writes while keeping the current map', async ({
  page,
}) => {
  await page.clock.install();
  page.on('dialog', (dialog) => dialog.accept());
  await test.step('timing:load', () => page.goto('/'));
  await renameRoot(page, 'Private map');
  await page.clock.fastForward(250);
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  const checkbox = await settings(page);
  await expect(checkbox).toBeChecked();
  const audit = await test.step('timing:accessibility', () => auditAccessibility(page));
  expect(audit.violations).toEqual([]);
  await checkbox.uncheck();
  await expect(checkbox).toBeEnabled();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Private map', exact: true })).toBeVisible();
  await expect(page.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  await renameRoot(page, 'Still private');
  await page.clock.fastForward(250);
  await expect(page.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  await test.step('timing:reload', () => page.reload());
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
  await expect(await settings(page)).not.toBeChecked();
  await page.getByRole('checkbox', { name: label, exact: true }).check();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await renameRoot(page, 'Keep this draft');
  await page.clock.fastForward(250);
  await expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  await test.step('timing:reload', () => page.reload());
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toBeVisible();
});

test('applies draft privacy changes to another open tab', async ({ page, context }) => {
  await test.step('timing:load', () => page.goto('/'));
  const other = await test.step('timing:new-tab', () => context.newPage());
  await other.clock.install();
  await test.step('timing:load', () => other.goto('/'));
  await renameRoot(other, 'Other tab private content');
  await other.clock.fastForward(250);
  await expect(other.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  await (await settings(page)).uncheck();
  await expect(other.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  await renameRoot(other, 'New private edit');
  await other.clock.fastForward(250);
  await expect(other.getByTitle('기기 초안 보관 꺼짐', { exact: true })).toBeVisible();
  other.on('dialog', (dialog) => dialog.accept());
  await test.step('timing:reload', () => other.reload());
  await expect(other.getByRole('button', { name: '초안 복구', exact: true })).toHaveCount(0);
  await other.close();
});
