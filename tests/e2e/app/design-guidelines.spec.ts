import { test, expect, type Page } from '@playwright/test';

async function addChildren(page: Page, parent: string, titles: string[]) {
  for (const title of titles) {
    await page.getByRole('treeitem', { name: parent, exact: true }).click();
    await page.keyboard.press('Tab');
    await page.getByRole('textbox', { name: '노드 제목' }).fill(title);
    await page.keyboard.press('Enter');
  }
}
const node = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });

test('deletes a branch at once and offers undo on the canvas without shifting it', async ({
  page,
}) => {
  let nativeDialog = false;
  page.on('dialog', async (dialog) => {
    nativeDialog = true;
    await dialog.dismiss();
  });
  await page.goto('/');
  await addChildren(page, '중심 주제', ['가지']);
  await addChildren(page, '가지', ['잎']);
  const canvas = page.locator('.canvas');
  const before = (await canvas.boundingBox())!.y;
  await node(page, '가지').click();
  await page.keyboard.press('Delete');
  await expect(node(page, '가지')).toHaveCount(0);
  expect(nativeDialog).toBe(false);
  const toast = page.locator('.canvas-toast');
  await expect(toast).toHaveText(/노드 2개를 삭제했습니다/);
  expect((await canvas.boundingBox())!.y).toBe(before);
  await toast.getByRole('button', { name: '삭제 실행 취소', exact: true }).click();
  await expect(node(page, '잎')).toHaveCount(1);
  await expect(toast).toHaveCount(0);
  // A single leaf goes quietly; Ctrl/⌘ Z is enough.
  await node(page, '잎').click();
  await page.keyboard.press('Delete');
  await expect(node(page, '잎')).toHaveCount(0);
  await expect(toast).toHaveCount(0);
});

test('asks in an app dialog with a named action before replacing unsaved work', async ({
  page,
}) => {
  await page.goto('/');
  await addChildren(page, '중심 주제', ['저장 안 한 가지']);
  const open = () =>
    page.locator('input[type=file]').setInputFiles({
      name: 'other.mup',
      mimeType: 'application/json',
      buffer: Buffer.from('{"id":1,"title":"다른 맵"}'),
    });
  await open();
  const dialog = page.getByRole('dialog', { name: '저장하지 않은 변경', exact: true });
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(node(page, '저장 안 한 가지')).toBeVisible();
  await open();
  await dialog.getByRole('button', { name: '변경 버리고 열기', exact: true }).click();
  await expect(node(page, '다른 맵')).toBeVisible();
});

test('moves through toolbar menus with the same keys as the context menu', async ({ page }) => {
  await page.goto('/');
  const view = page.getByRole('button', { name: '보기', exact: true });
  await view.focus();
  await expect(view).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(view).toHaveAttribute('aria-expanded', 'true');
  const items = page.locator('.view-menu .menu-items button:not(:disabled)');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view).toHaveAttribute('aria-expanded', 'false');
  await expect(view).toBeFocused();
  // A command run from the menu leaves focus on a visible control.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(view).toBeFocused();
});

test('names note state and icon choices without relying on a dot or emoji', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '메모', exact: true }).click();
  await page.getByRole('textbox', { name: '메모', exact: true }).fill('기록');
  await page.getByRole('button', { name: '메모 저장' }).click();
  await expect(page.getByRole('button', { name: '메모 (작성됨)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '서식', exact: true }).click();
  const style = page.getByRole('dialog', { name: '노드 서식' });
  await expect(style.getByRole('button', { name: '아이디어', exact: true })).toHaveAttribute(
    'title',
    '아이디어',
  );
  await expect(style.getByRole('button', { name: '빨강', exact: true }).first()).toHaveAttribute(
    'title',
    '빨강',
  );
});
