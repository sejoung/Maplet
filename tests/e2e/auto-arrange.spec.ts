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
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'untidy.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole('treeitem')).toHaveCount(13);
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

test('arranges the whole map by branch size, fits it on screen, and restores the entire arrangement with one undo', async ({
  page,
}) => {
  await open(page);
  const before = await boxes(page);
  const rootElement = page.getByRole('treeitem', { name: '읽기 좋은 전체 배치', exact: true });
  await expect(rootElement).toBeInViewport();
  const beforeView = (await rootElement.boundingBox())!;
  const arrange = page.getByRole('button', { name: '전체 맵 자동 배치', exact: true });
  await expect(arrange).toBeVisible();
  await arrange.click();
  const after = await boxes(page);
  expectClear(after);
  const root = after.find((node) => node.id === 'root')!;
  expect(after.find((node) => node.id === 'branch-0')!.x).toBeGreaterThan(root.x + root.width);
  for (let i = 1; i < 6; i++)
    expect(after.find((node) => node.id === `branch-${i}`)!.x).toBeLessThan(root.x);
  await expect
    .poll(async () => {
      const bounds = (await page.getByRole('application').boundingBox())!;
      const nodes = await page.getByRole('treeitem').evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      );
      return nodes.every(
        (node) =>
          node.x >= bounds.x &&
          node.y >= bounds.y &&
          node.right <= bounds.x + bounds.width &&
          node.bottom <= bounds.y + bounds.height,
      );
    })
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('balanced-layout.png') });
  const arrangedView = (await rootElement.boundingBox())!;
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await boxes(page)).toEqual(before);
  await expect
    .poll(async () => Math.round((await rootElement.boundingBox())!.x - beforeView.x))
    .toBe(0);
  await expect
    .poll(async () => Math.round((await rootElement.boundingBox())!.y - beforeView.y))
    .toBe(0);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  expect(await boxes(page)).toEqual(after);
  await expect
    .poll(async () => Math.round((await rootElement.boundingBox())!.x - arrangedView.x))
    .toBe(0);
  await expect
    .poll(async () => Math.round((await rootElement.boundingBox())!.y - arrangedView.y))
    .toBe(0);
  await arrange.click();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await boxes(page)).toEqual(before);
});

test('keeps automatic placement and branch directions in downloaded files and browser recovery', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: '전체 맵 자동 배치', exact: true }).click();
  const arranged = await boxes(page);
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  expect(await boxes(page)).toEqual(arranged);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 저장', exact: true }).click();
  const path = (await (await pending).path())!;
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.nodes.root.notes).toBe('원래 메모');
  expect(
    Object.values(saved.nodes).every((node) => (node as { position: unknown }).position === null),
  ).toBe(true);
  await page.locator('input[type=file]').setInputFiles(path);
  expect(await boxes(page)).toEqual(arranged);
});

test('commits an in-progress title before arranging and keeps the toolbar usable across screen sizes and languages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  await page.getByRole('treeitem', { name: '읽기 좋은 전체 배치', exact: true }).press('F2');
  await page.getByRole('textbox', { name: '노드 제목', exact: true }).fill('편집 중인 제목도 보존');
  await page.getByRole('button', { name: '전체 맵 자동 배치', exact: true }).click();
  await expect(
    page.getByRole('treeitem', { name: '편집 중인 제목도 보존', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: '노드 제목', exact: true })).toHaveCount(0);
  expectClear(await boxes(page));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const language of ['ko', 'en']) {
    await page.getByRole('combobox', { name: /^(언어|Language)$/ }).selectOption(language);
    for (const width of [320, 360, 390, 768, 901, 1024, 1280]) {
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
      expect(clipped, `${language}, ${width}px`).toEqual([]);
    }
  }
});
