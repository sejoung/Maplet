import { test, expect, type Page, type Locator } from '@playwright/test';

async function dragCorner(page: Page, node: Locator, dx: number, dy: number) {
  const handle = node.getByRole('button', { name: '노드 크기 조절', exact: true });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
}

test('resizes at the current zoom with live connectors, stable positions and one undo step', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'size.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ id: 'root', title: 'Root', ideas: { 1: { id: 'child', title: 'Child' } } }),
    ),
  });
  const root = page.getByRole('treeitem', { name: 'Root', exact: true });
  await root.click();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  const before = (await root.boundingBox())!;
  const edge = page.locator('[data-edge-to=child]');
  const path = await edge.getAttribute('d');
  await dragCorner(page, root, 95, 55);
  await expect
    .poll(async () => Math.round((await root.boundingBox())!.width - before.width))
    .toBe(95);
  await expect(edge).not.toHaveAttribute('d', path!);
  await page.mouse.up();
  const after = (await root.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.height - before.height).toBeCloseTo(55, 0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect
    .poll(async () => Math.round((await root.boundingBox())!.width))
    .toBe(Math.round(before.width));
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect
    .poll(async () => Math.round((await root.boundingBox())!.width))
    .toBe(Math.round(after.width));
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  const savedWidth = await root.evaluate((node) => (node as HTMLElement).style.width);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles((await (await pending).path())!);
  await expect(root).toHaveCSS('width', savedWidth);
});

test('cancels resizing, supports keyboard dimensions and restores automatic sizing', async ({
  page,
}) => {
  await page.goto('/');
  const node = page.getByRole('treeitem');
  const before = (await node.boundingBox())!;
  await dragCorner(page, node, 80, 45);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await node.boundingBox())!.width))
    .toBe(Math.round(before.width));
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  const handle = node.getByRole('button', { name: '노드 크기 조절' });
  await handle.focus();
  await handle.press('ArrowRight');
  expect((await node.boundingBox())!.width).toBeGreaterThan(before.width);
  await handle.press('Home');
  await expect
    .poll(async () => Math.round((await node.boundingBox())!.width))
    .toBe(Math.round(before.width));
  await handle.press('ArrowRight');
  await handle.dblclick();
  await expect
    .poll(async () => Math.round((await node.boundingBox())!.width))
    .toBe(Math.round(before.width));
  await expect(page.getByRole('textbox', { name: '노드 제목' })).toHaveCount(0);
});

test('uses subtle minus and plus buttons to collapse and expand a branch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem').press('Tab');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  const root = page.getByRole('treeitem', { name: '중심 주제', exact: true });
  await root.click();
  // The resized parent can overlap a child's old position; its controls must stay usable.
  await dragCorner(page, root, 100, 30);
  await page.mouse.up();
  const collapse = page.getByRole('button', { name: '중심 주제 접기', exact: true });
  await expect(collapse.locator('.lucide-minus')).toHaveCount(1);
  await collapse.click();
  const expand = page.getByRole('button', { name: '중심 주제 펼치기', exact: true });
  await expect(expand.locator('.lucide-plus')).toHaveCount(1);
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expand.click();
  await expect(page.getByRole('treeitem')).toHaveCount(2);
});

test('keeps long text visible when narrowing a node and cancels interrupted resizing', async ({
  page,
}) => {
  await page.goto('/');
  const node = page.getByRole('treeitem');
  await node.press('F2');
  const title = '긴 제목도 크기를 줄였을 때 모든 내용을 읽을 수 있어야 합니다';
  await page.getByRole('textbox', { name: '노드 제목' }).fill(title);
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await dragCorner(page, node, -160, -200);
  await page.mouse.up();
  const measurement = await node.evaluate((element) => {
    const node = element as HTMLElement;
    const text = node.querySelector('.node-text')!;
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
    return {
      width: node.offsetWidth,
      height: node.offsetHeight,
      minimumHeight: text.children.length * lineHeight + 30,
      text: [...text.children].map((line) => line.textContent).join(''),
    };
  });
  expect(measurement.width).toBe(120);
  expect(measurement.height).toBeGreaterThanOrEqual(measurement.minimumHeight);
  expect(measurement.text).toBe(title);
  await node.dblclick();
  await expect(node).toHaveCSS('width', '120px');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Escape');
  const handle = node.getByRole('button', { name: '노드 크기 조절' });
  const before = await node.evaluate((element) => (element as HTMLElement).style.width);
  await dragCorner(page, node, 80, 30);
  await handle.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  await expect(node).toHaveCSS('width', before);
});
