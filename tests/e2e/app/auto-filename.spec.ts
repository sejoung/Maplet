import { test, expect, type Page } from '@playwright/test';

async function editRoot(page: Page, title: string, key = 'Enter') {
  await page.getByRole('treeitem').first().press('F2');
  const editor = page.getByRole('textbox', { name: '노드 제목', exact: true });
  await editor.fill(title);
  await editor.press(key);
}

test('ignores cancelled, unchanged and composing titles, then names the document before keyboard save', async ({
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
  await editor.fill('업무 계획');
  await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(name).toHaveText('제목 없음');
  await expect(editor).toBeFocused();
  const downloaded = page.waitForEvent('download');
  await editor.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
  expect((await downloaded).suggestedFilename().normalize('NFC')).toMatch(/^업무[ _]계획\.maplet$/);
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('업무 계획');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await editRoot(page, '수정한 중심 주제');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('업무 계획');
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
  await editRoot(page, '다시 고친 루트');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('복구 후 이름');
});
