import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockGoogle } from './support/google';

test.use({ locale: 'en-US' });

test('uses browser language and switches UI without changing document contents', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Maplet — Mind map editor');
  await expect(page.getByRole('treeitem', { name: 'Central topic', exact: true })).toBeVisible();
  await expect(page.getByText('1 node', { exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/native-v1.maplet');
  const root = page.getByRole('treeitem', { name: 'Maplet document', exact: true });
  await root.press('F2');
  await page.getByRole('textbox', { name: 'Node title', exact: true }).fill('내 문서 — unchanged');
  await page.getByRole('textbox', { name: 'Node title', exact: true }).press('Enter');
  const downloadDocument = async (label: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('banner').getByRole('button', { name: label, exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  };
  const before = await downloadDocument('Save .maplet');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.mup', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ko');
  await page
    .getByRole('dialog', { name: '설정', exact: true })
    .getByRole('button', { name: '완료', exact: true })
    .click();
  await expect(
    page.getByRole('banner').getByRole('button', { name: '설정', exact: true }),
  ).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('alert')).toContainText('올바른 JSON');
  await expect(
    page.getByRole('treeitem', { name: '내 문서 — unchanged', exact: true }),
  ).toBeVisible();
  expect(await downloadDocument('.maplet 저장')).toEqual(before);
  await page.reload();
  await expect(page.getByRole('button', { name: '파일', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '언어', exact: true })).toHaveValue('ko');
  await page.getByRole('banner').getByRole('button', { name: '설정', exact: true }).click();
  const restoredSettings = page.getByRole('dialog', { name: '설정', exact: true });
  await expect(restoredSettings.getByRole('combobox', { name: '언어', exact: true })).toHaveValue(
    'ko',
  );
  await page.keyboard.press('Escape');
  await expect(restoredSettings).toHaveCount(0);
});

test('restores a browser draft after a language change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem').press('F2');
  await page.getByRole('textbox', { name: 'Node title' }).fill('언어와 무관한 문서');
  await page.getByRole('textbox', { name: 'Node title' }).press('Enter');
  await expect(page.getByText('Draft saved in browser', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ko');
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole('dialog', { name: '초안 복구', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect(
    page.getByRole('treeitem', { name: '언어와 무관한 문서', exact: true }),
  ).toBeVisible();
});

test('translates node dialogs and sends the selected language to the Drive picker', async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto('/');
  if (!(await page.getByRole('button', { name: 'Link', exact: true }).isVisible())) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Apply link', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Links must use http, https, or mailto.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await page.getByRole('button', { name: 'Choose save folder', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a save folder' })).toHaveAttribute(
    'data-picker-parent',
    'root',
  );
  await expect(
    page.getByRole('dialog', { name: 'Choose a save folder', exact: true }),
  ).toHaveAttribute('data-picker-locale', 'en');
  await page.getByRole('button', { name: '선택 취소' }).click();
  await expect(page.locator('.drive-status')).toHaveText('Save location selection cancelled.');
});

test('uses a saved preference before browser language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maplet-language', 'ko'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
});
