import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = JSON.stringify({
  formatVersion: 2,
  id: 'root',
  title: '읽기 좋은 전체 배치',
  attr: { 'maplet:position': { x: 800, y: -200 }, notes: '원래 메모' },
  ideas: Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [
      String(i + 1),
      {
        id: `branch-${i}`,
        title: i === 0 ? '큰 가지: 세부 항목을 그룹으로 읽기' : `작은 가지 ${i}`,
        attr: {
          'maplet:position': { x: 800, y: -200 },
          style: { width: 190, fontSize: i === 0 ? 20 : 16 },
        },
        ...(i === 0 && {
          ideas: Object.fromEntries(
            Array.from({ length: 6 }, (_, j) => [
              String(j + 1),
              {
                id: `detail-${j}`,
                title: `세부 내용 ${j}: 긴 문장도 이웃 노드와 겹치지 않도록 배치합니다.`,
                attr: { 'maplet:position': { x: 800, y: -200 }, style: { width: 205 } },
              },
            ]),
          ),
        }),
      },
    ]),
  ),
});
async function open(page: Page) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'untidy.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole('treeitem')).toHaveCount(13);
  await expect(page.locator('[data-node-id=root]')).toHaveCSS('left', '800px');
  await expect(page.locator('[data-node-id=root]')).toHaveCSS('top', '-200px');
}
async function boxes(page: Page) {
  return page.getByRole('treeitem').evaluateAll((elements) =>
    elements.map((element) => {
      const el = element as HTMLElement;
      return {
        id: el.dataset.nodeId!,
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.minHeight),
      };
    }),
  );
}
function expectClear(nodes: Awaited<ReturnType<typeof boxes>>) {
  for (let i = 0; i < nodes.length; i++)
    for (const b of nodes.slice(i + 1)) {
      const a = nodes[i];
      expect(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      ).toBe(true);
    }
}

test('arranges, restores history and drafts, reopens native files and keeps the toolbar usable across sizes and languages', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await open(page);
  const before = await boxes(page);
  const rootElement = page.getByRole('treeitem', { name: '읽기 좋은 전체 배치', exact: true });
  await expect(rootElement).toBeInViewport();
  const beforeView = (await rootElement.boundingBox())!;
  const arrange = page.getByRole('button', { name: '전체 맵 자동 배치', exact: true });
  await expect(arrange).toBeVisible();
  await test.step('arrange and fit all branches', async () => {
    await arrange.click();
    await expect
      .poll(() =>
        page.getByRole('application').evaluate((canvas) => {
          const bounds = canvas.getBoundingClientRect();
          return [...canvas.querySelectorAll('[role=treeitem]')].every((element) => {
            const node = element.getBoundingClientRect();
            return (
              node.x >= bounds.x &&
              node.y >= bounds.y &&
              node.right <= bounds.right &&
              node.bottom <= bounds.bottom
            );
          });
        }),
      )
      .toBe(true);
  });
  const after = await boxes(page);
  expectClear(after);
  const root = after.find((node) => node.id === 'root')!;
  expect(after.find((node) => node.id === 'branch-0')!.x).toBeGreaterThan(root.x + root.width);
  for (let i = 1; i < 6; i++)
    expect(after.find((node) => node.id === `branch-${i}`)!.x).toBeLessThan(root.x);
  await page.screenshot({ path: test.info().outputPath('balanced-layout.png') });
  const arrangedView = (await rootElement.boundingBox())!;
  const undo = page.getByRole('button', { name: '실행 취소', exact: true });
  const redo = page.getByRole('button', { name: '다시 실행', exact: true });
  await test.step('restore document and viewport with one undo and redo', async () => {
    await undo.click();
    expect(await boxes(page)).toEqual(before);
    await expect
      .poll(async () => {
        const rect = (await rootElement.boundingBox())!;
        return [Math.round(rect.x - beforeView.x), Math.round(rect.y - beforeView.y)];
      })
      .toEqual([0, 0]);
    await expect(undo).toBeDisabled();
    await redo.click();
    expect(await boxes(page)).toEqual(after);
    await expect
      .poll(async () => {
        const rect = (await rootElement.boundingBox())!;
        return [Math.round(rect.x - arrangedView.x), Math.round(rect.y - arrangedView.y)];
      })
      .toEqual([0, 0]);
    await arrange.click();
    await undo.click();
    expect(await boxes(page)).toEqual(before);
    await expect(undo).toBeDisabled();
    await redo.click();
    expect(await boxes(page)).toEqual(after);
  });
  await test.step('recover the arrangement from IndexedDB and reopen the native download', async () => {
    await page.clock.fastForward(250);
    await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    await page.reload();
    await page.getByRole('button', { name: '초안 복구', exact: true }).click();
    expect(await boxes(page)).toEqual(after);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
    const path = (await (await pending).path())!;
    const content = await readFile(path);
    const saved = JSON.parse(content.toString('utf8'));
    expect(saved.nodes.root.notes).toBe('원래 메모');
    expect(
      Object.values(saved.nodes).every((node) => (node as { position: unknown }).position === null),
    ).toBe(true);
    await page.locator('input[type=file]').setInputFiles({
      name: 'arranged.maplet',
      mimeType: 'application/json',
      buffer: content,
    });
    await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('arranged');
    expect(await boxes(page)).toEqual(after);
  });
  await test.step('commit an in-progress title and arrange an overlapping map', async () => {
    await open(page);
    await rootElement.press('F2');
    await page
      .getByRole('textbox', { name: '노드 제목', exact: true })
      .fill('편집 중인 제목도 보존');
    await arrange.click();
    await expect(
      page.getByRole('treeitem', { name: '편집 중인 제목도 보존', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: '노드 제목', exact: true })).toHaveCount(0);
    expectClear(await boxes(page));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
  for (const language of ['ko', 'en'])
    for (const width of [1024, 1280, 1440])
      await test.step(`toolbar: ${language}, ${width}px`, async () => {
        if (width === 1024)
          await page.getByRole('combobox', { name: /^(언어|Language)$/ }).selectOption(language);
        await page.setViewportSize({ width, height: 700 });
        const clipped = await page
          .getByRole('toolbar')
          .getByRole('button')
          .evaluateAll((elements) =>
            elements
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return rect.width && (rect.x < 0 || rect.right > window.innerWidth);
              })
              .map((element) => element.getAttribute('aria-label') ?? element.textContent),
          );
        expect(clipped).toEqual([]);
      });
});
