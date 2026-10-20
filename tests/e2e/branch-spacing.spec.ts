import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(page: Page, intrusion = false, initialOverlap = false) {
  await page.goto('/');
  const node = (id: string, x: number, y: number, ideas = {}) => ({
    id,
    title: id,
    attr: { style: { width: 100 }, 'maplet:position': { x, y } },
    ideas,
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'spacing.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify(
        node('root', 80, 80, {
          1: node('a', 280, 80, { 1: node('child', intrusion ? 680 : 480, 80) }),
          2: node('b', 480, intrusion ? (initialOverlap ? 80 : 160) : 240, {
            1: node('bChild', 680, intrusion ? 400 : 240),
          }),
        }),
      ),
    ),
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
  // within one screen pixel even when the map is zoomed out on mobile.
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

test('shows whole group envelopes and moves a branch when a child enters its empty interior', async ({
  page,
}) => {
  await open(page, true);
  const before = await positions(page);
  const parent = page.locator('[data-node-id=a]');
  const box = (await parent.boundingBox())!;
  const scale = box.width / before.a.width;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 180 * scale, { steps: 8 });
  const preview = await positions(page);
  // No dragged node would touch an original stationary node. Its child enters
  // the protected space between the stationary branch's parent and child.
  for (const id of ['a', 'child'])
    for (const other of ['b', 'bChild']) {
      const a = preview[id],
        b = before[other];
      expect(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      ).toBe(true);
    }
  expect(preview.b).not.toEqual(before.b);
  expect(preview.bChild.x - preview.b.x).toBe(before.bChild.x - before.b.x);
  expect(preview.bChild.y - preview.b.y).toBeCloseTo(before.bChild.y - before.b.y, 5);
  const regions = await page.locator('.branch-region').evaluateAll((elements) =>
    elements.map((element) => {
      const region = element as HTMLElement;
      return {
        id: region.dataset.branchRegion,
        ids: JSON.parse(region.dataset.regionNodes!) as string[],
        x: parseFloat(region.style.left),
        y: parseFloat(region.style.top),
        width: parseFloat(region.style.width),
        height: parseFloat(region.style.height),
      };
    }),
  );
  expect(regions).toHaveLength(2);
  for (const region of regions) {
    const nodes = region.ids.map((id) => preview[id]);
    expect(region.x).toBeCloseTo(Math.min(...nodes.map((node) => node.x)) - 12, 4);
    expect(region.y).toBeCloseTo(Math.min(...nodes.map((node) => node.y)) - 12, 4);
    expect(region.x + region.width).toBeCloseTo(
      Math.max(...nodes.map((node) => node.x + node.width)) + 12,
      4,
    );
    expect(region.y + region.height).toBeCloseTo(
      Math.max(...nodes.map((node) => node.y + node.height)) + 12,
      4,
    );
  }
  const [a, b] = regions;
  expect(
    a.x + a.width <= b.x + 1e-5 ||
      b.x + b.width <= a.x + 1e-5 ||
      a.y + a.height <= b.y + 1e-5 ||
      b.y + b.height <= a.y + 1e-5,
  ).toBe(true);
  await page.mouse.up();
  expect(await positions(page)).toEqual(preview);
  await expect(page.locator('.branch-region')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await positions(page)).toEqual(before);
});

for (const action of ['Escape', 'pointercancel', 'lostpointercapture'] as const)
  test(`restores both groups without history when the live drag is cancelled by ${action}`, async ({
    page,
  }) => {
    await open(page);
    const before = await positions(page);
    const { pointerId } = await overlap(page);
    expect((await positions(page)).b).not.toEqual(before.b);
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.locator('[data-node-id=a]').dispatchEvent(action, { pointerId });
    await page.mouse.up();
    expect(await positions(page)).toEqual(before);
    await expect(page.locator('.branch-region.displaced')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  });

test('restores nearby branches when moving away and keeps updating before release', async ({
  page,
}) => {
  await open(page);
  const before = await positions(page);
  const { start, target } = await overlap(page);
  const first = await positions(page);
  await page.mouse.move(start.x, start.y + 10, { steps: 5 });
  expect((await positions(page)).b).toEqual(before.b);
  expect((await positions(page)).bChild).toEqual(before.bChild);
  await expect(page.locator('.branch-region.displaced')).toHaveCount(0);
  await page.mouse.move(target.x, target.y, { steps: 5 });
  expect(await positions(page)).toEqual(first);
  // The final pointer position, not the first collision, determines the commit.
  await page.mouse.move(target.x + 10, target.y + 4, { steps: 3 });
  const last = await positions(page);
  expect(last.a).not.toEqual(first.a);
  await page.mouse.up();
  expect(await positions(page)).toEqual(last);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await positions(page)).toEqual(before);
});

test('does not record a drag that returns to its starting position', async ({ page }) => {
  await open(page);
  const before = await positions(page);
  const { start } = await overlap(page);
  await page.mouse.move(start.x, start.y, { steps: 5 });
  await page.mouse.up();
  expect(await positions(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});

test('keeps a visible correction to an existing intrusion even after returning to the drag origin', async ({
  page,
}) => {
  await open(page, true, true);
  const before = await positions(page);
  const box = (await page.locator('[data-node-id=a]').boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 20, { steps: 3 });
  await page.mouse.move(x, y, { steps: 3 });
  const preview = await positions(page);
  expect(preview.a).toEqual(before.a);
  expect(preview.b).not.toEqual(before.b);
  await page.mouse.up();
  expect(await positions(page)).toEqual(preview);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await positions(page)).toEqual(before);
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
