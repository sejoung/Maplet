import { test, expect, type Page } from '@playwright/test';
import { renameRoot } from './support/drive-workspace';

async function newMap(page: Page, title: string) {
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('button', { name: '새 맵', exact: true }).click();
  await page.getByRole('textbox', { name: '중심 주제' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
}
const draftSaved = (page: Page) =>
  expect(page.getByTitle('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
// Recovery is decided right after startup; give it time before asserting nothing is offered.
async function noRecovery(page: Page) {
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: '초안 복구' })).toHaveCount(0);
}

test('opens a new map in its own tab and keeps every tab draft separate', async ({
  page,
  context,
}) => {
  await page.goto('/');
  // An untouched tab is reused for the new map.
  await newMap(page, 'First tab');
  await expect(page.getByRole('treeitem', { name: 'First tab', exact: true })).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await draftSaved(page);

  const opened = context.waitForEvent('page');
  await newMap(page, 'Second tab');
  const second = await opened;
  second.on('dialog', (dialog) => dialog.accept());
  await expect(second.getByRole('treeitem', { name: 'Second tab', exact: true })).toBeVisible();
  expect(new URL(second.url()).hash).toBe('');
  await expect(page.getByRole('treeitem', { name: 'First tab', exact: true })).toBeVisible();
  await renameRoot(second, 'Second tab edited');
  await draftSaved(second);

  // A reload recovers this tab's own draft, not the other open tab's.
  await second.reload();
  await expect(second.getByText('Second tab.maplet', { exact: false })).toBeVisible();
  await second.getByRole('button', { name: '초안 복구' }).click();
  await expect(
    second.getByRole('treeitem', { name: 'Second tab edited', exact: true }),
  ).toBeVisible();

  // Drafts of open tabs are never offered elsewhere.
  const third = await context.newPage();
  await third.goto('/');
  await noRecovery(third);

  // Once a tab is closed, the next visit offers its draft.
  await page.close();
  const fourth = await context.newPage();
  await fourth.goto('/');
  await expect(fourth.getByText('First tab.maplet', { exact: false })).toBeVisible();
  await fourth.getByRole('button', { name: '초안 복구' }).click();
  await expect(fourth.getByRole('treeitem', { name: 'First tab', exact: true })).toBeVisible();
  await draftSaved(fourth);
  await fourth.close();
  const fifth = await context.newPage();
  await fifth.goto('/');
  await expect(fifth.getByText('First tab.maplet', { exact: false })).toBeVisible();
  await expect(fifth.getByText('Second tab', { exact: false })).toHaveCount(0);
});
