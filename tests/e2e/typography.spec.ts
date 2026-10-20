import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openStyle(page: Page, label = '서식', more = '더보기') {
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: more, exact: true }).click();
  await button.click();
}

test('applies typography together, cancels changes and undoes the whole style in one step', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.getByRole('treeitem');
  await expect(root).toHaveCSS('text-align', 'left');
  await openStyle(page);
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('20');
  await page.getByRole('combobox', { name: '글꼴', exact: true }).selectOption('serif');
  await page.getByRole('button', { name: '오른쪽 정렬', exact: true }).click();
  await page.getByRole('button', { name: '블루', exact: true }).click();
  await expect(root).toHaveCSS('font-size', '15px');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await openStyle(page);
  await expect(page.getByRole('combobox', { name: '글자 크기' })).toHaveValue('15');
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('20');
  await page.getByRole('combobox', { name: '글꼴', exact: true }).selectOption('serif');
  await page.getByRole('button', { name: '오른쪽 정렬', exact: true }).click();
  await page.getByRole('button', { name: '블루', exact: true }).click();
  await page.getByRole('button', { name: '서식 적용', exact: true }).click();
  await expect(root).toHaveCSS('font-size', '20px');
  await expect(root).toHaveCSS('text-align', 'right');
  await expect(root).toHaveCSS('font-family', /Georgia/);
  await expect(root).toHaveCSS('background-color', 'rgb(232, 238, 248)');
  await root.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await expect(input).toHaveCSS('text-align', 'right');
  await expect(input).toHaveCSS('font-size', '20px');
  await expect(input).toHaveCSS('line-height', '30px');
  await input.press('Escape');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(root).toHaveCSS('font-size', '15px');
  await expect(root).toHaveCSS('text-align', 'left');
  await expect(root).toHaveCSS('background-color', 'rgb(228, 240, 234)');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(root).toHaveCSS('font-size', '20px');
  await expect(root).toHaveCSS('text-align', 'right');
});

test('fits large multiline text and restores typography from files and browser drafts', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.getByRole('treeitem');
  await root.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('WWWW 한국어와 English 긴 제목을 함께 확인합니다');
  await input.press('Enter');
  await openStyle(page);
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('20');
  await page.getByRole('combobox', { name: '글꼴', exact: true }).selectOption('mono');
  await page.getByRole('button', { name: '가운데 정렬', exact: true }).click();
  await page.getByRole('button', { name: '서식 적용', exact: true }).click();
  const fits = await root.evaluate((node) => {
    const text = node.querySelector('.node-text')!;
    const box = node.getBoundingClientRect();
    const content = text.getBoundingClientRect();
    return (
      content.top >= box.top &&
      content.bottom <= box.bottom &&
      [...text.children].every((line) => line.scrollWidth <= line.clientWidth)
    );
  });
  expect(fits).toBe(true);
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect(root).toHaveCSS('font-size', '20px');
  await expect(root).toHaveCSS('text-align', 'center');
  await expect(root).toHaveCSS('font-family', /monospace/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  const path = (await (await pending).path())!;
  const document = JSON.parse(await readFile(path, 'utf8'));
  expect(document.nodes.root.style).toMatchObject({
    fontSize: 20,
    fontFamily: 'mono',
    textAlign: 'center',
  });
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(root).toHaveCSS('font-size', '20px');
  await expect(root).toHaveCSS('text-align', 'center');
});

test('localizes the style dialog and applies its controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('maplet-language', 'en'));
  await page.goto('/');
  await openStyle(page, 'Style', 'More');
  const dialog = page.getByRole('dialog', { name: 'Node style', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Font', exact: true })).toHaveValue('sans');
  await expect(dialog.getByRole('button', { name: 'Align left', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('combobox', { name: 'Font size' }).selectOption('12');
  await dialog.getByRole('button', { name: 'Align center', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply style', exact: true }).click();
  await expect(page.getByRole('treeitem')).toHaveCSS('font-size', '12px');
  await expect(page.getByRole('treeitem')).toHaveCSS('text-align', 'center');
});
