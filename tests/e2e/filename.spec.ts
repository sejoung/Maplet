import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('edits the header filename and downloads native and compatible files without changing node titles', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  const name = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await expect(name).toBeFocused();
  await name.fill('나의 계획.maplet');
  await name.press('Enter');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('나의 계획');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
  let downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^나의[ _]계획\.maplet$/);
  const raw = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(raw.nodes[raw.roots[0]].title).toBe('중심 주제');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '파일', exact: true }).click();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.mup 내보내기', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^나의[ _]계획\.mup$/);
});

test('commits on blur, cancels with Escape, rejects empty names and protects Korean composition', async ({
  page,
}) => {
  await page.goto('/');
  const rename = page.getByRole('button', { name: /^파일 이름 변경:/ });
  await rename.click();
  const name = page.getByRole('textbox', { name: '파일 이름', exact: true });
  await name.fill('취소할 이름');
  await name.press('Escape');
  await expect(rename).toHaveText('제목 없음');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await rename.click();
  await name.fill('');
  await name.press('Enter');
  await expect(name).toBeVisible();
  await name.press('Escape');
  await rename.click();
  await name.fill('한글 이름');
  await name.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  });
  await expect(name).toBeVisible();
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).focus();
  await expect(rename).toHaveText('한글 이름');
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});

test('recovers a renamed file after refresh even when the document content did not change', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).fill('복구할 파일');
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).press('Enter');
  await page.clock.runFor(300);
  await expect(page.locator('.save-status')).toContainText('브라우저에 초안 저장됨');
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('복구할 파일');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^복구할[ _]파일\.maplet$/);
});

test('uses the current name when saving directly from the filename editor', async ({ page }) => {
  await page.goto('/');
  const rename = page.getByRole('button', { name: /^파일 이름 변경:/ });
  await rename.click();
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).fill('바로 저장');
  let downloaded = page.waitForEvent('download');
  await page
    .getByRole('textbox', { name: '파일 이름', exact: true })
    .press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
  expect((await downloaded).suggestedFilename()).toMatch(/^바로[ _]저장\.maplet$/);
  await rename.click();
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).fill('버튼으로 저장');
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^버튼으로[ _]저장\.maplet$/);
});

test('keeps filename editing available on a narrow screen and translates its controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  await page
    .getByRole('textbox', { name: '파일 이름', exact: true })
    .fill('아주 길지만 편집할 수 있는 파일 이름');
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).press('Enter');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: '언어', exact: true }).selectOption('en');
  await page.getByRole('button', { name: /^Rename file:/ }).click();
  await expect(page.getByRole('textbox', { name: 'File name', exact: true })).toHaveValue(
    '아주 길지만 편집할 수 있는 파일 이름',
  );
});
