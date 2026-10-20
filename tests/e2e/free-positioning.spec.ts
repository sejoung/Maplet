import { test, expect } from '@playwright/test';

const source = JSON.stringify({
  formatVersion: 2,
  id: 'root',
  title: '중심',
  ideas: {
    '1': {
      id: 'a',
      title: '첫 가지',
      ideas: {
        '1': {
          id: 'child',
          title: '하위 항목',
          ideas: { '1': { id: 'grandchild', title: '세부 항목' } },
        },
      },
    },
    '2': { id: 'b', title: '둘째 가지' },
  },
});
async function open(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'positions.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
}
async function drag(
  page: import('@playwright/test').Page,
  node: import('@playwright/test').Locator,
  dx: number,
  dy: number,
) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
}

test('adjusts connection length live by dragging a node and undoes the whole movement once', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const node = page.getByRole('treeitem', { name: '첫 가지', exact: true });
  const root = page.getByRole('treeitem', { name: '중심', exact: true });
  const before = (await node.boundingBox())!;
  const rootBefore = (await root.boundingBox())!;
  const descendants = [
    page.getByRole('treeitem', { name: '하위 항목', exact: true }),
    page.getByRole('treeitem', { name: '세부 항목', exact: true }),
  ];
  const childrenBefore = await Promise.all(descendants.map((node) => node.boundingBox()));
  const edge = page.locator('path[data-edge-to="a"]');
  const pathBefore = await edge.getAttribute('d');
  await drag(page, node, 140, 60);
  await expect.poll(async () => Math.round((await node.boundingBox())!.x - before.x)).toBe(140);
  await expect(edge).not.toHaveAttribute('d', pathBefore!);
  for (const [index, child] of descendants.entries()) {
    await expect
      .poll(async () => Math.round((await child.boundingBox())!.x - childrenBefore[index]!.x))
      .toBe(140);
    await expect
      .poll(async () => Math.round((await child.boundingBox())!.y - childrenBefore[index]!.y))
      .toBe(60);
  }
  await page.mouse.up();
  await expect.poll(async () => Math.round((await node.boundingBox())!.y - before.y)).toBe(60);
  for (const [index, child] of descendants.entries())
    await expect
      .poll(async () => Math.round((await child.boundingBox())!.x - childrenBefore[index]!.x))
      .toBe(140);
  await expect(node).toHaveAttribute('aria-level', '2');
  expect((await root.boundingBox())!.x).toBeCloseTo(rootBefore.x, 0);
  expect((await root.boundingBox())!.y).toBeCloseTo(rootBefore.y, 0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(async () => Math.round((await node.boundingBox())!.x - before.x)).toBe(0);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  for (const [index, child] of descendants.entries())
    await expect
      .poll(async () => Math.round((await child.boundingBox())!.x - childrenBefore[index]!.x))
      .toBe(0);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect.poll(async () => Math.round((await node.boundingBox())!.x - before.x)).toBe(140);
  for (const [index, child] of descendants.entries())
    await expect
      .poll(async () => Math.round((await child.boundingBox())!.x - childrenBefore[index]!.x))
      .toBe(140);
});

test('preserves manual positions through recovery, download and reimport at a changed zoom', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  const node = page.getByRole('treeitem', { name: '둘째 가지', exact: true });
  const before = (await node.boundingBox())!;
  await drag(page, node, -70, 45);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await node.boundingBox())!.x - before.x)).toBe(-70);
  const left = await node.evaluate((element) => (element as HTMLElement).style.left);
  const top = await node.evaluate((element) => (element as HTMLElement).style.top);
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구' }).click();
  await expect
    .poll(() => node.evaluate((element) => (element as HTMLElement).style.left))
    .toBe(left);
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.top)).toBe(top);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles((await (await downloaded).path())!);
  await expect
    .poll(() => node.evaluate((element) => (element as HTMLElement).style.left))
    .toBe(left);
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.top)).toBe(top);
});

test('moves the root itself and keeps connections attached', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const root = page.getByRole('treeitem', { name: '중심', exact: true });
  const before = (await root.boundingBox())!;
  const child = page.getByRole('treeitem', { name: '하위 항목', exact: true });
  const childBefore = (await child.boundingBox())!;
  const edge = page.locator('path[data-edge-to="a"]');
  const old = await edge.getAttribute('d');
  await drag(page, root, 35, 65);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await root.boundingBox())!.x - before.x)).toBe(35);
  await expect(edge).not.toHaveAttribute('d', old!);
  await expect
    .poll(async () => Math.round((await child.boundingBox())!.x - childBefore.x))
    .toBe(35);
  await expect
    .poll(async () => Math.round((await child.boundingBox())!.y - childBefore.y))
    .toBe(65);
  await page.getByRole('button', { name: '노드 작업', exact: true }).click();
  await page.getByRole('button', { name: '맵 자동 정렬', exact: true }).click();
  await expect.poll(async () => Math.round((await root.boundingBox())!.x - before.x)).toBe(0);
  await expect.poll(async () => Math.round((await child.boundingBox())!.x - childBefore.x)).toBe(0);
});

test('moves collapsed descendants with their parent and persists the branch through recovery', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const parent = page.getByRole('treeitem', { name: '첫 가지', exact: true });
  const child = page.getByRole('treeitem', { name: '하위 항목', exact: true });
  const grandchild = page.getByRole('treeitem', { name: '세부 항목', exact: true });
  const position = (node: import('@playwright/test').Locator) =>
    node.evaluate((element) => ({
      x: parseFloat((element as HTMLElement).style.left),
      y: parseFloat((element as HTMLElement).style.top),
    }));
  await drag(page, child, 0, -25);
  await page.mouse.up();
  const parentBefore = await position(parent);
  const before = [await position(child), await position(grandchild)];
  await page.getByRole('button', { name: '첫 가지 접기', exact: true }).click();
  await expect(child).toHaveCount(0);
  await drag(page, parent, -35, 45);
  await page.mouse.up();
  const after = await position(parent);
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구' }).click();
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  await page.getByRole('button', { name: '첫 가지 펼치기', exact: true }).click();
  for (const [index, descendant] of [child, grandchild].entries()) {
    const point = await position(descendant);
    expect(point.x - before[index].x).toBeCloseTo(after.x - parentBefore.x, 3);
    expect(point.y - before[index].y).toBeCloseTo(after.y - parentBefore.y, 3);
  }
});

test('cancels a drag with Escape and does not record clicks as edits', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const node = page.getByRole('treeitem', { name: '첫 가지', exact: true });
  const before = (await node.boundingBox())!;
  const child = page.getByRole('treeitem', { name: '하위 항목', exact: true });
  const childBefore = (await child.boundingBox())!;
  await node.click();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await drag(page, node, 50, 30);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => Math.round((await node.boundingBox())!.x - before.x)).toBe(0);
  await expect.poll(async () => Math.round((await child.boundingBox())!.x - childBefore.x)).toBe(0);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});
