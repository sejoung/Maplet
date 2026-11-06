import { test, expect, type Page } from '@playwright/test';

const source = JSON.stringify({
  formatVersion: 2,
  id: 'root',
  title: '중심',
  ideas: {
    '1': { id: 'a', title: '기획', ideas: { '1': { id: 'a1', title: '일정' } } },
    '2': { id: 'b', title: '디자인' },
    '3': { id: 'c', title: '개발' },
  },
});
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const node = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const selected = (page: Page) =>
  page
    .locator('[role=treeitem][aria-selected=true]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
const center = async (page: Page, name: string) => {
  const box = (await node(page, name).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'group.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
}

test('selects several nodes by modified clicks, keyboard and an area', async ({ page }) => {
  await open(page);
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  await node(page, '기획').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['기획', '디자인', '개발']);
  await expect(page.getByRole('tree')).toHaveAttribute('aria-multiselectable', 'true');
  await expect(page.getByText('3개 선택됨')).toBeVisible();
  // The last added node is focused, and toggling it again drops it.
  await expect(node(page, '기획')).toBeFocused();
  await node(page, '기획').click({ modifiers: [modifier] });
  expect(await selected(page)).toEqual(['디자인', '개발']);
  await expect(node(page, '개발')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual(['개발']);
  await expect(page.getByText(/개 선택됨/)).toHaveCount(0);
  // Shift+arrows extend; a plain click narrows again.
  await page.keyboard.press('Shift+ArrowUp');
  expect(await selected(page)).toEqual(['디자인', '개발']);
  await expect(node(page, '디자인')).toBeFocused();
  await node(page, '개발').click();
  expect(await selected(page)).toEqual(['개발']);
  await page.keyboard.press(`${modifier}+a`);
  expect(await selected(page)).toHaveLength(5);
  // Clicking empty canvas narrows to the focused node.
  const canvas = (await page.getByRole('application', { name: '마인드맵 캔버스' }).boundingBox())!;
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20);
  expect(await selected(page)).toEqual(['개발']);
  // Shift-drag on empty canvas selects every node the area touches.
  const from = await center(page, '디자인');
  const to = await center(page, '개발');
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + 300, from.y - 4);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y + 4, { steps: 6 });
  await expect(page.locator('.selection-marquee')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.selection-marquee')).toHaveCount(0);
  expect(await selected(page)).toEqual(['디자인', '개발']);
});

test('applies delete, copy, paste, duplicate and style to every selected node', async ({
  page,
}) => {
  await open(page);
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  await node(page, '개발').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: '노드 메뉴' });
  await expect(menu.getByRole('menuitem', { name: '선택한 노드 2개 삭제' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: '위로 이동' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: '복제' }).click();
  await expect(node(page, '디자인')).toHaveCount(2);
  await expect(node(page, '개발')).toHaveCount(2);
  expect(await selected(page)).toEqual(['디자인', '개발']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  // Copy both, paste under another node, then delete the originals in one step.
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  await page.keyboard.press(`${modifier}+c`);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  await node(page, '일정').click();
  await page.keyboard.press(`${modifier}+v`);
  await expect(node(page, '디자인')).toHaveCount(2);
  // Both copies land under the target, before the originals in document order.
  for (const name of ['디자인', '개발'])
    await expect(node(page, name).first()).toHaveAttribute('aria-level', '4');
  expect(await selected(page)).toEqual(['디자인', '개발']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  await page.getByRole('button', { name: '선택한 노드 삭제' }).click();
  await expect(node(page, '디자인')).toHaveCount(0);
  await expect(node(page, '개발')).toHaveCount(0);
  expect(await selected(page)).toEqual(['중심']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(node(page, '디자인')).toHaveCount(1);
  await expect(node(page, '개발')).toHaveCount(1);
  // Style changes apply to the whole group.
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  await page.getByRole('button', { name: '서식', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('개발 외 1개');
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('20');
  await page.getByRole('button', { name: '서식 적용' }).click();
  for (const name of ['디자인', '개발'])
    await expect(node(page, name)).toHaveCSS('font-size', '20px');
  await expect(node(page, '기획')).not.toHaveCSS('font-size', '20px');
});

test('drags a selected group together and drops it onto a new parent', async ({ page }) => {
  await open(page);
  await node(page, '디자인').click();
  await node(page, '개발').click({ modifiers: [modifier] });
  const before = await Promise.all(['디자인', '개발', '기획'].map((name) => center(page, name)));
  await page.mouse.move(before[0].x, before[0].y);
  await page.mouse.down();
  await page.mouse.move(before[0].x + 120, before[0].y + 30, { steps: 8 });
  await page.mouse.up();
  const after = await Promise.all(['디자인', '개발', '기획'].map((name) => center(page, name)));
  for (const index of [0, 1]) {
    expect(after[index].x - before[index].x).toBeCloseTo(120, 0);
    expect(after[index].y - before[index].y).toBeCloseTo(30, 0);
  }
  expect(after[2]).toEqual(before[2]);
  expect(await selected(page)).toEqual(['디자인', '개발']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await center(page, '개발')).toEqual(before[1]);
  // Dropping the group on a node makes both its children.
  const target = await center(page, '일정');
  await page.mouse.move(before[1].x, before[1].y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(node(page, '일정')).toHaveClass(/drop-target/);
  await page.mouse.up();
  for (const name of ['디자인', '개발'])
    await expect(node(page, name)).toHaveAttribute('aria-level', '4');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  for (const name of ['디자인', '개발'])
    await expect(node(page, name)).toHaveAttribute('aria-level', '2');
});
