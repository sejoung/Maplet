import { test, expect } from '@playwright/test';

async function tool(page: import('@playwright/test').Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: '더보기', exact: true }).click();
  await button.click();
}

test('edits directly on a node and cancels without a side panel', async ({ page }) => {
  await page.goto('/');
  const root = page.getByRole('treeitem', { name: '중심 주제', exact: true });
  await root.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await expect(input).toBeFocused();
  await input.fill('취소할 제목');
  await input.press('Escape');
  await expect(root).toBeFocused();
  await root.press('F2');
  await input.fill('작업 계획');
  await input.press('Enter');
  await expect(page.getByRole('treeitem', { name: '작업 계획', exact: true })).toBeFocused();
  await expect(page.getByRole('complementary')).toHaveCount(0);
});

test('opens color options only from the toolbar and returns to the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '블루', exact: true })).toHaveCount(0);
  await tool(page, '서식');
  await expect(page.getByRole('dialog', { name: '노드 서식' })).toBeVisible();
  await page.getByRole('button', { name: '블루', exact: true }).click();
  await page.getByRole('button', { name: '서식 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('treeitem')).toHaveCSS('background-color', 'rgb(232, 238, 248)');
  await tool(page, '서식');
  await page.getByRole('button', { name: '기본 색상', exact: true }).click();
  await page.getByRole('button', { name: '서식 적용', exact: true }).click();
  await expect(page.getByRole('treeitem')).toHaveCSS('background-color', 'rgb(228, 240, 234)');
  await tool(page, '서식');
  await page.getByRole('button', { name: '화이트', exact: true }).click();
  await page.getByRole('button', { name: '서식 적용', exact: true }).click();
  await expect(page.getByRole('treeitem')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('commits inline typing before keyboard save and protects Korean composition', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('treeitem').press('F2');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('한글 입력');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(input).toBeFocused();
  const downloaded = page.waitForEvent('download');
  await input.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
  const stream = await (await downloaded).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).nodes.root.title).toBe('한글 입력');
});

test('finds a node without a persistent outline', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/v2-rich.mup');
  await tool(page, '찾기');
  await page.getByRole('textbox', { name: '노드 검색' }).fill('작은 단계');
  await page.getByRole('button', { name: '작은 단계', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: '작은 단계', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('complementary')).toHaveCount(0);
});

test('keeps the current title when Tab continues inline editing into a child', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem').press('F2');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('정리한 제목');
  await input.press('Tab');
  await expect(input).toBeFocused();
  await expect(page.getByRole('treeitem', { name: '정리한 제목', exact: true })).toHaveCount(1);
  await input.fill('하위 항목');
  await input.press('Enter');
  await expect(page.getByRole('treeitem', { name: '하위 항목', exact: true })).toHaveAttribute(
    'aria-level',
    '2',
  );
});

test('leaving an emptied title for another node restores it instead of stranding the editor', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.getByRole('treeitem', { name: '중심 주제', exact: true });
  await root.click();
  await root.press('Tab');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await expect(input).toBeFocused();
  await input.fill('');
  await root.click();
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: '새 노드', exact: true })).toBeVisible();
  await expect(root).toBeFocused();
  await expect(root).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // An explicit Enter on an empty title still explains why it cannot be saved.
  await page.getByRole('treeitem', { name: '새 노드', exact: true }).dblclick();
  await input.fill('');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('제목은');
  await expect(input).toBeFocused();
});

test('keeps the composed Korean syllable when moving to another node mid-composition', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.getByRole('treeitem', { name: '중심 주제', exact: true });
  await root.click();
  await root.press('Tab');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.insertText', { text: '안' });
  for (const text of ['ㄴ', '녀', '녕'])
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: 1,
      selectionEnd: 1,
    });
  await root.click();
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: '안녕', exact: true })).toBeVisible();
});
