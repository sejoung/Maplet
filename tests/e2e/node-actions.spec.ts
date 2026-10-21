import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addChildren(page: Page, parent: string, titles: string[]) {
  for (const title of titles) {
    await page.getByRole('treeitem', { name: parent, exact: true }).click();
    await page.keyboard.press('Tab');
    await page.getByRole('textbox', { name: '노드 제목' }).fill(title);
    await page.keyboard.press('Enter');
  }
}
const node = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const top = async (page: Page, name: string) => (await node(page, name).boundingBox())!.y;
const menu = (page: Page) => page.getByRole('menu', { name: '노드 메뉴' });

test('offers every node action from a context menu by pointer and keyboard', async ({ page }) => {
  await page.goto('/');
  await addChildren(page, '중심 주제', ['기획', '개발']);
  await node(page, '개발').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: '하위 노드 추가' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu(page).getByRole('menuitem', { name: '노드 삭제' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(node(page, '개발')).toBeFocused();
  // Reorder from the menu, then back with the keyboard.
  expect(await top(page, '개발')).toBeGreaterThan(await top(page, '기획'));
  await node(page, '개발').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '위로 이동' }).click();
  expect(await top(page, '개발')).toBeLessThan(await top(page, '기획'));
  await node(page, '개발').press('Alt+ArrowDown');
  expect(await top(page, '개발')).toBeGreaterThan(await top(page, '기획'));
  // Shift+F10 opens the same menu beside the focused node.
  await node(page, '기획').press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('menuitem', { name: '복제' }).click();
  await expect(node(page, '기획')).toHaveCount(2);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(node(page, '기획')).toHaveCount(1);
  await node(page, '기획').press('ControlOrMeta+d');
  await expect(node(page, '기획')).toHaveCount(2);
  // A click outside closes the menu without acting.
  await node(page, '개발').click({ button: 'right' });
  await page.locator('.canvas').click({ position: { x: 10, y: 10 } });
  await expect(menu(page)).toHaveCount(0);
});

test('copies, cuts and pastes branches, including outlines from other apps', async ({ page }) => {
  await page.goto('/');
  await addChildren(page, '중심 주제', ['원본', '대상']);
  await addChildren(page, '원본', ['하위']);
  const clipboardEvent = (type: 'copy' | 'cut' | 'paste', text = '') =>
    page.evaluate(
      ([type, text]) => {
        const data = new DataTransfer();
        if (text) data.setData('text/plain', text);
        document.activeElement!.dispatchEvent(
          new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }),
        );
        return data.getData('text/plain');
      },
      [type, text] as const,
    );
  await node(page, '원본').click();
  expect(await clipboardEvent('copy')).toBe('원본\n\t하위');
  await node(page, '대상').click();
  await clipboardEvent('paste', '원본\n\t하위');
  await expect(node(page, '원본')).toHaveCount(2);
  await expect(node(page, '하위')).toHaveCount(2);
  await expect(node(page, '원본').nth(1)).toHaveAttribute('aria-level', '3');
  // Text from another app becomes nodes, following its indentation.
  await node(page, '대상').click();
  await clipboardEvent('paste', '- 할 일\n  - 첫째\n  - 둘째');
  await expect(node(page, '할 일')).toHaveAttribute('aria-level', '3');
  await expect(node(page, '둘째')).toHaveAttribute('aria-level', '4');
  await node(page, '대상').click();
  expect(await clipboardEvent('cut')).toContain('대상');
  await expect(node(page, '대상')).toHaveCount(0);
  await node(page, '중심 주제').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '붙여넣기' }).click();
  await expect(node(page, '대상')).toHaveCount(1);
  await expect(node(page, '첫째')).toHaveCount(1);
});

test('shows note and link badges, exports images and zooms with the keyboard', async ({ page }) => {
  await page.goto('/');
  await addChildren(page, '중심 주제', ['자료']);
  await node(page, '자료').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '링크' }).click();
  await page.getByRole('textbox', { name: '링크' }).fill('https://example.com/docs');
  await page.getByRole('button', { name: '링크 적용' }).click();
  await node(page, '자료').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '메모' }).click();
  await page.getByRole('textbox', { name: '메모' }).fill('회의록 요약');
  await page.getByRole('button', { name: '메모 저장' }).click();
  const link = node(page, '자료').getByRole('link', { name: /링크 열기/ });
  await expect(link).toHaveAttribute('href', 'https://example.com/docs');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(node(page, '자료').getByRole('img', { name: '메모 있음' })).toHaveAttribute(
    'title',
    '회의록 요약',
  );
  for (const [label, check] of [
    [
      'PNG 이미지 다운로드',
      (bytes: Buffer) => expect([...bytes.subarray(1, 4)]).toEqual([80, 78, 71]),
    ],
    ['SVG 이미지 다운로드', (bytes: Buffer) => expect(bytes.toString()).toContain('자료')],
  ] as const) {
    await page.getByRole('button', { name: '파일', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^제목 없음\.(png|svg)$/);
    check(await readFile((await file.path())!));
  }
  const zoom = page.locator('output');
  const before = await zoom.first().textContent();
  await node(page, '자료').press('ControlOrMeta+=');
  await expect(zoom.first()).not.toHaveText(before!);
  await node(page, '자료').press('ControlOrMeta+0');
});

test('keeps the document name readable on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await expect(page.locator('.drive-label-short')).toBeHidden();
  const name = await page.getByRole('button', { name: /^파일 이름 변경:/ }).boundingBox();
  expect(name!.width).toBeGreaterThan(60);
});
