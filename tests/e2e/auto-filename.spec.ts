import { test, expect, type Page } from '@playwright/test';

async function editRoot(page: Page, title: string, key = 'Enter') {
  await page.getByRole('treeitem').first().press('F2');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill(title);
  await editor.press(key);
}

test('names an untitled document from its first committed root title before keyboard save', async ({
  page,
}) => {
  await page.goto('/');
  const downloaded = page.waitForEvent('download');
  await editRoot(page, '업무 계획', `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
  expect((await downloaded).suggestedFilename().normalize('NFC')).toMatch(/^업무[ _]계획\.maplet$/);
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('업무 계획');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await editRoot(page, '수정한 중심 주제');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('업무 계획');
});

test('keeps explicitly chosen filenames even when they equal the untitled placeholder', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^파일 이름 변경:/ }).click();
  await page.getByRole('textbox', { name: '파일 이름', exact: true }).press('Enter');
  await editRoot(page, '중심 제목 변경');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('제목 없음');
});

test('waits for an actual root title change and ignores cancellation and composition', async ({
  page,
}) => {
  await page.goto('/');
  const name = page.getByRole('button', { name: /^파일 이름 변경:/ });
  await editRoot(page, '취소할 제목', 'Escape');
  await expect(name).toHaveText('제목 없음');
  await editRoot(page, '중심 주제');
  await expect(name).toHaveText('제목 없음');
  await page.getByRole('treeitem').first().press('F2');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill('한글 제목');
  await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(name).toHaveText('제목 없음');
  await editor.press('Enter');
  await expect(name).toHaveText('한글 제목');
});

test('keeps the unnamed state through child edits and draft recovery', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('treeitem').first().press('Tab');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill('하위 항목부터 작성');
  await editor.press('Enter');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('제목 없음');
  await page.clock.runFor(300);
  await expect(page.locator('.save-status')).toContainText('브라우저에 초안 저장됨');
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await editRoot(page, '복구 후 이름');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('복구 후 이름');
  await page.clock.runFor(300);
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await editRoot(page, '다시 고친 루트');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('복구 후 이름');
});

test('preserves an opened filename even if its name is the untitled placeholder', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: '제목 없음.mup',
    mimeType: 'application/json',
    buffer: Buffer.from('{"id":1,"title":"불러온 중심 주제"}'),
  });
  await expect(page.getByRole('treeitem', { name: '불러온 중심 주제', exact: true })).toBeVisible();
  await editRoot(page, '불러온 맵 편집');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('제목 없음');
});
