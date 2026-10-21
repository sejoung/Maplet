import { test, expect } from '@playwright/test';

const source = JSON.stringify({
  formatVersion: 2,
  id: 'root',
  title: '중심',
  ideas: {
    '1': { id: 'a', title: '첫 가지', ideas: { '1': { id: 'child', title: '세부' } } },
    '2': { id: 'b', title: '둘째 가지' },
  },
});
async function openFixture(page: import('@playwright/test').Page) {
  await test.step('timing:load', () => page.goto('/'));
  await test.step('timing:import', () =>
    page.locator('input[type=file]').setInputFiles({
      name: 'interaction.mup',
      mimeType: 'application/json',
      buffer: Buffer.from(source),
    }));
}

async function tool(page: import('@playwright/test').Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: '더보기', exact: true }).click();
  await button.click();
}

test('reparents, edits notes and safe links, deletes and restores a subtree', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('treeitem', { name: '첫 가지', exact: true }).click();
  await tool(page, '메모');
  await page.getByRole('textbox', { name: '메모', exact: true }).fill('보존할 메모');
  await page.getByRole('button', { name: '메모 저장' }).click();
  await tool(page, '링크');
  await page.getByRole('textbox', { name: '링크', exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: '링크 적용' }).click();
  await expect(page.getByRole('alert')).toContainText('http');
  await page.getByRole('textbox', { name: '링크', exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: '링크 적용' }).click();
  await page.getByRole('button', { name: '노드 작업', exact: true }).click();
  await page.getByRole('button', { name: '노드 이동', exact: true }).click();
  await page.getByRole('combobox', { name: '상위 노드' }).selectOption('b');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '첫 가지', exact: true })).toHaveAttribute(
    'aria-level',
    '3',
  );
  await expect(page.getByRole('treeitem', { name: '세부', exact: true })).toHaveAttribute(
    'aria-level',
    '4',
  );
  await tool(page, '메모');
  await expect(page.getByRole('textbox', { name: '메모', exact: true })).toHaveValue('보존할 메모');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '노드 작업', exact: true }).click();
  await page.getByRole('button', { name: '노드 삭제', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '세부', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '세부', exact: true })).toHaveCount(1);
  // Deletion is also a visible toolbar action, not only a menu item or a key.
  await page.getByRole('treeitem', { name: '세부', exact: true }).click();
  await page.getByRole('toolbar').getByRole('button', { name: '선택한 노드 삭제' }).click();
  await expect(page.getByRole('treeitem', { name: '세부', exact: true })).toHaveCount(0);
});

test('treats imported HTML as text and backs up the exact original', async ({ page }) => {
  await test.step('timing:load', () => page.goto('/'));
  const hostile =
    '{"id":1,"title":"<img src=x onerror=alert(1)>","attr":{"attachment":{"contentType":"text/html","content":"<script>alert(1)</script>"}}}';
  let alertShown = false;
  page.on('dialog', async (dialog) => {
    alertShown = true;
    await dialog.dismiss();
  });
  await test.step('timing:import', () =>
    page.locator('input[type=file]').setInputFiles({
      name: 'safe.mup',
      mimeType: 'application/json',
      buffer: Buffer.from(hostile),
    }));
  await expect(page.getByRole('treeitem')).toHaveAttribute(
    'aria-label',
    '<img src=x onerror=alert(1)>',
  );
  expect(await page.locator('.mind-node img').count()).toBe(0);
  expect(alertShown).toBe(false);
  await page.getByRole('button', { name: '파일', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '원본 백업 다운로드' }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(hostile);
});

test('selects a node with the mouse and edits inline', async ({ page }) => {
  await openFixture(page);
  const root = page.getByRole('treeitem', { name: '중심', exact: true });
  await root.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: '첫 가지', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  await root.click();
  await expect(root).toHaveAttribute('aria-selected', 'true');
  await root.press('F2');
  await expect(page.getByRole('textbox', { name: '노드 제목' })).toHaveValue('중심');
});

test('runs document keyboard shortcuts while a canvas node has focus', async ({ page }) => {
  await openFixture(page);
  const node = page.getByRole('treeitem', { name: '둘째 가지', exact: true });
  await node.press('Delete');
  await expect(node).toHaveCount(0);
  const root = page.getByRole('treeitem', { name: '중심', exact: true });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await root.press(`${modifier}+z`);
  await expect(node).toHaveCount(1);
  const download = page.waitForEvent('download');
  await root.press(`${modifier}+s`);
  expect((await download).suggestedFilename()).toBe('interaction.maplet');
});

test('reparents a branch dropped onto another node in one undo step', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const branch = page.getByRole('treeitem', { name: '둘째 가지', exact: true });
  const target = page.getByRole('treeitem', { name: '첫 가지', exact: true });
  const before = (await branch.boundingBox())!;
  const box = (await target.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  // While hovering, the target is marked and the connector already leads from it.
  await expect(target).toHaveClass(/drop-target/);
  await expect(target).toHaveAttribute('data-drop-label', '여기로 옮기기');
  await expect(page.locator('[data-edge-to=b]')).toHaveAttribute('data-edge-from', 'a');
  await expect(page.locator('.branch-region.displaced')).toHaveCount(0);
  await page.mouse.up();
  await expect(branch).toHaveAttribute('aria-level', '3');
  await expect(page.locator('.drop-target')).toHaveCount(0);
  await expect(page.locator('[data-edge-to=b]')).toHaveAttribute('data-edge-from', 'a');
  await expect(branch).toBeFocused();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(branch).toHaveAttribute('aria-level', '2');
  await expect(page.locator('[data-edge-to=b]')).toHaveAttribute('data-edge-from', 'root');
});

test('snaps to a node beside the dragged node, and Alt or Escape keeps the parent', async ({
  page,
}) => {
  await openFixture(page);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const branch = page.getByRole('treeitem', { name: '둘째 가지', exact: true });
  const target = page.getByRole('treeitem', { name: '첫 가지', exact: true });
  const hint = page.locator('.drag-hint');
  const before = (await branch.boundingBox())!;
  const box = (await target.boundingBox())!;
  await page.mouse.move(before.x + 4, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/drop-target/);
  await expect(hint).toHaveText(
    '노드에 붙여 놓으면 하위로 이동 · 점선은 놓을 때 비켜날 자리 · Alt(⌥): 위치만 이동',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.drop-target')).toHaveCount(0);
  await expect(hint).toHaveCount(0);
  await page.mouse.up();
  await expect(branch).toHaveAttribute('aria-level', '2');
  // Just above the node still snaps to it; holding Alt moves the branch freely instead.
  const start = (await branch.boundingBox())!;
  const above = { x: box.x + 4, y: box.y - 10 - start.height / 2 };
  await page.mouse.move(start.x + 4, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(above.x, above.y, { steps: 8 });
  await expect(target).toHaveClass(/drop-target/);
  await page.keyboard.down('Alt');
  await expect(page.locator('.drop-target')).toHaveCount(0);
  await expect(hint).toHaveText('위치만 옮기는 중 · Alt(⌥)를 떼면 부모 바꾸기');
  await page.keyboard.up('Alt');
  await expect(target).toHaveClass(/drop-target/);
  await page.keyboard.down('Alt');
  await page.mouse.move(above.x, above.y - 2);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(branch).toHaveAttribute('aria-level', '2');
  await expect
    .poll(() =>
      page.locator('[data-node-id=a], [data-node-id=b]').evaluateAll((elements) => {
        const [box, other] = elements.map((element) => element.getBoundingClientRect());
        return (
          box.right <= other.x ||
          other.right <= box.x ||
          box.bottom <= other.y ||
          other.bottom <= box.y
        );
      }),
    )
    .toBe(true);
});

test('pans the canvas from an empty area', async ({ page }) => {
  await openFixture(page);
  const root = page.getByRole('treeitem', { name: '중심', exact: true });
  const before = await root.boundingBox();
  const canvas = await page.getByRole('application', { name: '마인드맵 캔버스' }).boundingBox();
  await page.mouse.move(canvas!.x + 25, canvas!.y + 140);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 65, canvas!.y + 195, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const box = (await root.boundingBox())!;
      return [Math.round(box.x - before!.x), Math.round(box.y - before!.y)];
    })
    .toEqual([40, 55]);
});
