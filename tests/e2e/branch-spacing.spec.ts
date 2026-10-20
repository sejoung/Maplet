import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { branchSpacingSource } from '../support/drag-fixture';

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'spacing.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(branchSpacingSource()),
  });
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
}
async function positions(page: Page) {
  return page.locator('[data-node-id]').evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((element) => {
        const node = element as HTMLElement;
        return [
          node.dataset.nodeId!,
          {
            x: parseFloat(node.style.left),
            y: parseFloat(node.style.top),
            width: node.offsetWidth,
            height: node.offsetHeight,
          },
        ];
      }),
    ),
  );
}
async function overlap(page: Page) {
  const parent = page.locator('[data-node-id=a]');
  const box = (await parent.boundingBox())!;
  const width = await parent.evaluate((node) => (node as HTMLElement).offsetWidth);
  await parent.evaluate((node) =>
    node.addEventListener(
      'pointerdown',
      (event) => {
        node.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId));
      },
      { once: true },
    ),
  );
  const child = (await page.locator('[data-node-id=child]').boundingBox())!;
  const obstacle = (await page.locator('[data-node-id=b]').boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const target = { x: start.x, y: start.y + obstacle.y - child.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Only the descendant overlaps the other branch at this pointer position.
  await page.mouse.move(target.x, target.y, { steps: 8 });
  return {
    start,
    target,
    scale: box.width / width,
    pointerId: Number(await parent.getAttribute('data-test-pointer')),
  };
}

test('moves the other branch live and commits exactly the visible arrangement on release as one undo step', async ({
  page,
}) => {
  await open(page);
  const before = await positions(page);
  const edge = page.locator('[data-edge-to=bChild]');
  const path = await edge.getAttribute('d');
  const { start, target, scale } = await overlap(page);
  const preview = await positions(page);
  // Browsers quantize screen pointer coordinates; check the visible destination
  // within one screen pixel even when the map is zoomed out.
  expect(Math.abs((preview.a.y - before.a.y) * scale - (target.y - start.y))).toBeLessThanOrEqual(
    1,
  );
  expect(preview.a.x).toBe(before.a.x);
  expect(preview.child.y - preview.a.y).toBe(before.child.y - before.a.y);
  expect(preview.child.x - preview.a.x).toBe(before.child.x - before.a.x);
  expect(preview.b).not.toEqual(before.b);
  expect(preview.bChild.x - preview.b.x).toBe(before.bChild.x - before.b.x);
  expect(preview.bChild.y - preview.b.y).toBeCloseTo(before.bChild.y - before.b.y, 5);
  expect(preview.root).toEqual(before.root);
  expect(
    preview.child.y >= preview.b.y + preview.b.height + 23.9 ||
      preview.child.y + preview.child.height + 23.9 <= preview.b.y ||
      preview.child.x >= preview.b.x + preview.b.width + 23.9 ||
      preview.child.x + preview.child.width + 23.9 <= preview.b.x,
  ).toBe(true);
  await expect(edge).not.toHaveAttribute('d', path!);
  await expect(page.locator('.branch-region.displaced')).toHaveCount(1);
  await expect(page.locator('[data-branch-region=a]')).toHaveAttribute(
    'data-region-nodes',
    JSON.stringify(['a', 'child']),
  );
  await expect(page.locator('[data-branch-region=b]')).toHaveAttribute(
    'data-region-nodes',
    JSON.stringify(['b', 'bChild']),
  );
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  // Saving while the pointer is still down must not persist the preview.
  const unconfirmedDownload = page.waitForEvent('download');
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
  const original = JSON.parse(await readFile((await (await unconfirmedDownload).path())!, 'utf8'));
  expect(original.nodes.a.position).toEqual({ x: before.a.x, y: before.a.y });
  expect(original.nodes.b.position).toEqual({ x: before.b.x, y: before.b.y });
  await page.mouse.up();
  expect(await positions(page)).toEqual(preview);
  await expect(page.locator('.branch-region.displaced')).toHaveCount(0);
  await expect(page.locator('.branch-region')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '배치 확정', exact: true })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'a', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await positions(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  expect(await positions(page)).toEqual(preview);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles((await (await downloaded).path())!);
  expect(await positions(page)).toEqual(preview);
});

test('restores both groups without history after Escape, pointercancel and lostpointercapture', async ({
  page,
}) => {
  await open(page);
  const before = await positions(page);
  await page.locator('[data-node-id=a]').click();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  for (const action of ['Escape', 'pointercancel', 'lostpointercapture'] as const)
    await test.step(action, async () => {
      const { pointerId } = await overlap(page);
      expect((await positions(page)).b).not.toEqual(before.b);
      if (action === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('[data-node-id=a]').dispatchEvent(action, { pointerId });
      await page.mouse.up();
      expect(await positions(page)).toEqual(before);
      await expect(page.locator('.branch-region')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
    });
});

test('abandons a live proposal if the document is replaced before release', async ({ page }) => {
  await open(page);
  await overlap(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'replacement.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ id: 'replacement', title: 'Replacement' })),
  });
  await page.mouse.up();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(page.getByRole('treeitem')).toHaveAttribute('aria-label', 'Replacement');
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
