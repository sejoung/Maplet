import { test, expect, type Locator, type Page } from '@playwright/test';

/** Select visible text inside the contenteditable title editor. */
const selectText = (input: Locator, text: string) =>
  input.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    const full = nodes.map((node) => node.data).join('');
    let start = full.indexOf(target);
    let end = start + target.length;
    const range = document.createRange();
    for (const node of nodes) {
      if (start >= 0 && start <= node.length) {
        range.setStart(node, start);
        start = -1;
      } else if (start >= 0) start -= node.length;
      if (end <= node.length) {
        range.setEnd(node, end);
        break;
      }
      end -= node.length;
    }
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);

async function startEditing(page: Page, title: string) {
  await page.goto('/');
  const root = page.getByRole('treeitem');
  await root.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill(title);
  return { root, input };
}

test('formats selected text with shortcuts and shows the result while editing', async ({
  page,
}) => {
  const { root, input } = await startEditing(page, '회의 금요일 마감');
  await selectText(input, '금요일');
  await input.press('ControlOrMeta+b');
  // No markers are visible; the editor already shows the formatting.
  await expect(input).toHaveText('회의 금요일 마감');
  await expect(input.locator('strong.rich-bold')).toHaveText('금요일');
  await selectText(input, '마감');
  await input.press('ControlOrMeta+Shift+H');
  await expect(input.locator('mark')).toHaveAttribute('data-highlight', 'yellow');
  // Typing continues normally after formatting.
  await page.keyboard.press('End');
  await page.keyboard.type(' 확인');
  await expect(input).toHaveText('회의 금요일 마감 확인');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(input).toHaveText('회의 금요일 마감');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(input.locator('mark')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(input.locator('mark')).toHaveCount(1);
  await input.press('Enter');

  await expect(root).toHaveAttribute('aria-label', '회의 금요일 마감');
  const bold = root.locator('.node-text strong.rich-bold');
  await expect(bold).toHaveText('금요일');
  // The root is already semibold, so inline bold is one step heavier.
  await expect(bold).toHaveCSS('font-weight', '800');
  const mark = root.locator('.node-text mark.rich-mark');
  await expect(mark).toHaveCSS('background-color', 'rgb(253, 230, 138)');
  await expect(root.locator('.node-text > span')).toHaveCount(1);
  const [box, right] = await Promise.all([
    root.boundingBox(),
    mark.evaluate((element) => element.getBoundingClientRect().right),
  ]);
  expect(right).toBeLessThanOrEqual(box!.x + box!.width);
  // The whole edit is one app-level undo step.
  await root.press('ControlOrMeta+z');
  await expect(root.locator('mark.rich-mark')).toHaveCount(0);
});

test('picks a highlighter color from the right-click menu on a selection', async ({ page }) => {
  const { root, input } = await startEditing(page, '예산 확정 금요일까지');
  await selectText(input, '예산 확정');
  await input.click({ button: 'right', position: { x: 10, y: 10 } });
  const menu = page.getByRole('menu', { name: '글자 서식' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitemradio', { name: '파랑 형광펜' }).click();
  await expect(menu).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input.locator('mark')).toHaveAttribute('data-highlight', 'blue');
  await expect(input.locator('mark')).toHaveText('예산 확정');

  // The node and its geometry match while editing and after leaving the editor.
  const editing = await root.boundingBox();
  await input.press('Enter');
  expect(await root.boundingBox()).toEqual(editing);
  await expect(root.locator('.node-text mark')).toHaveAttribute('data-highlight', 'blue');

  await root.press('F2');
  await selectText(input, '금요일');
  await input.press('Shift+F10');
  await expect(menu.getByRole('menuitemcheckbox', { name: /굵게/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(input.locator('mark[data-highlight="green"]')).toHaveText('금요일');
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(root.locator('.node-text mark')).toHaveCount(2);
});

test('keeps the browser menu, plain paste and line breaks in the editor', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { root, input } = await startEditing(page, '첫 줄');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('둘째');
  await page.evaluate(() => navigator.clipboard.writeText(' 붙임'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(input).toHaveText('첫 줄\n둘째 붙임');
  await input.click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '글자 서식' })).toHaveCount(0);
  await input.press('Enter');
  await expect(root.locator('.node-text > span')).toHaveText(['첫 줄', '둘째 붙임']);
});
