import { test, expect, type Locator } from '@playwright/test';

const selectText = (input: Locator, text: string) =>
  input.evaluate((element: HTMLTextAreaElement, target) => {
    const start = element.value.indexOf(target);
    element.setSelectionRange(start, start + target.length);
  }, text);

test('formats selected title text with shortcuts, keeps native undo and renders it', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.getByRole('treeitem');
  await root.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('회의 금요일 마감');
  await selectText(input, '금요일');
  await input.press('ControlOrMeta+b');
  await expect(input).toHaveValue('회의 **금요일** 마감');
  await selectText(input, '마감');
  await input.press('ControlOrMeta+Shift+H');
  await input.press('ControlOrMeta+Shift+H');
  await expect(input).toHaveValue('회의 **금요일** =={green}마감==');
  // The browser's own undo steps back through the formatting while editing.
  await input.press('ControlOrMeta+z');
  await expect(input).toHaveValue('회의 **금요일** ==마감==');
  await input.press('Enter');

  await expect(root).toHaveAttribute('aria-label', '회의 금요일 마감');
  await expect(root.locator('.node-text')).toHaveText('회의 금요일 마감');
  const bold = root.locator('strong.rich-bold');
  await expect(bold).toHaveText('금요일');
  await expect(bold).toHaveCSS('font-weight', '700');
  const mark = root.locator('mark.rich-mark');
  await expect(mark).toHaveText('마감');
  await expect(mark).toHaveAttribute('data-highlight', 'yellow');
  await expect(mark).toHaveCSS('background-color', 'rgb(253, 230, 138)');
  // The measured width fits the bold run: the title stays on one line inside the node.
  await expect(root.locator('.node-text > span')).toHaveCount(1);
  const [box, line] = await Promise.all([
    root.boundingBox(),
    mark.evaluate((element) => element.getBoundingClientRect().right),
  ]);
  expect(line).toBeLessThanOrEqual(box!.x + box!.width);

  // Editing again shows the markers; leaving the editor restores the formatted view.
  await root.dblclick();
  await expect(input).toHaveValue('회의 **금요일** ==마감==');
  await input.press('Escape');
  await expect(root.locator('mark.rich-mark')).toHaveCount(1);

  // The whole edit is one app-level undo step.
  await root.press('ControlOrMeta+z');
  await expect(root.locator('mark.rich-mark')).toHaveCount(0);
});
