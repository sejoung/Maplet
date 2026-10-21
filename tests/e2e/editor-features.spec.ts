import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = JSON.stringify({
  formatVersion: 2,
  id: 'root',
  title: '중심',
  ideas: {
    '1': {
      id: 'a',
      title: '기획',
      ideas: { '1': { id: 'a1', title: '일정', ideas: { '1': { id: 'a2', title: '세부 일정' } } } },
    },
    '2': { id: 'b', title: '디자인' },
    '3': { id: 'c', title: '개발' },
  },
});
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const node = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const box = async (page: Page, name: string) => (await node(page, name).boundingBox())!;

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'features.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
}
async function nodeMenu(page: Page, name: string, item: string) {
  await node(page, name).click({ button: 'right' });
  await page.getByRole('menu', { name: '노드 메뉴' }).getByRole('menuitem', { name: item }).click();
}
async function viewMenu(page: Page, item: string) {
  await page.getByRole('button', { name: '보기', exact: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

test('drops a branch between siblings to reorder or reparent it', async ({ page }) => {
  await open(page);
  const order = () =>
    page
      .locator('[data-node-id=root]')
      .evaluate(() =>
        ['a', 'b', 'c'].map(
          (id) => document.querySelector<HTMLElement>(`[data-node-id=${id}]`)!.offsetTop,
        ),
      );
  const [a, , c] = await order();
  expect(a).toBeLessThan(c);
  // Grab "개발" at its left edge and bring it just above "기획".
  const start = await box(page, '개발');
  const target = await box(page, '기획');
  await page.mouse.move(start.x + 4, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 4, target.y - start.height / 2 - 6, { steps: 8 });
  await expect(node(page, '기획')).toHaveClass(/drop-sibling/);
  await expect(page.locator('.drop-line')).toHaveAttribute('data-drop-label', '여기에 넣기');
  await page.mouse.up();
  const [movedA, , movedC] = await order();
  expect(movedC).toBeLessThan(movedA);
  await expect(node(page, '개발')).toHaveAttribute('aria-level', '2');
  // From another level: "세부 일정" goes right after "디자인" under the root.
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const deep = await box(page, '세부 일정');
  const design = await box(page, '디자인');
  await page.mouse.move(deep.x + 4, deep.y + deep.height / 2);
  await page.mouse.down();
  await page.mouse.move(design.x + 4, design.y + design.height + deep.height / 2 + 6, {
    steps: 8,
  });
  await expect(page.locator('.drop-line')).toHaveCount(1);
  await page.mouse.up();
  await expect(node(page, '세부 일정')).toHaveAttribute('aria-level', '2');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(node(page, '세부 일정')).toHaveAttribute('aria-level', '4');
});

test('shows levels, focuses a branch and adds a topic where the canvas was clicked', async ({
  page,
}) => {
  await open(page);
  await viewMenu(page, '주 가지만 보기');
  await expect(node(page, '일정')).toHaveCount(0);
  await expect(node(page, '기획')).toHaveAttribute('aria-expanded', 'false');
  await nodeMenu(page, '기획', '하위 모두 펼치기');
  await expect(node(page, '세부 일정')).toBeVisible();
  await viewMenu(page, '모두 펼치기');
  // Focus mode shows one branch with a way back.
  await nodeMenu(page, '기획', '이 가지만 보기');
  await expect(page.getByRole('status').filter({ hasText: '‘기획’ 가지만 보는 중' })).toBeVisible();
  await expect(node(page, '디자인')).toHaveCount(0);
  await expect(node(page, '세부 일정')).toBeVisible();
  await page.getByRole('button', { name: '전체 맵 보기' }).click();
  await expect(node(page, '디자인')).toBeVisible();
  // A new central topic appears at the right-clicked spot and starts in title editing.
  const canvas = (await page.getByRole('application', { name: '마인드맵 캔버스' }).boundingBox())!;
  const spot = { x: canvas.x + 60, y: canvas.y + 60 };
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.getByRole('menuitem', { name: '여기에 새 주제' }).click();
  const title = page.getByRole('textbox', { name: '노드 제목' });
  await title.fill('메모 주제');
  await title.press('Enter');
  const topic = await box(page, '메모 주제');
  expect(Math.abs(topic.x - spot.x)).toBeLessThan(2);
  expect(Math.abs(topic.y - spot.y)).toBeLessThan(2);
  await expect(node(page, '메모 주제')).toHaveAttribute('aria-level', '1');
});

test('finds nodes with Ctrl/⌘ F, stepping through highlighted matches', async ({ page }) => {
  await open(page);
  await node(page, '중심').click();
  await page.keyboard.press(`${modifier}+f`);
  const field = page.getByRole('searchbox', { name: '노드 검색' });
  await expect(field).toBeFocused();
  await field.fill('일정');
  await expect(page.locator('.search-match')).toHaveCount(2);
  await expect(page.locator('.find-count')).toHaveText('0/2');
  await field.press('Enter');
  await expect(node(page, '일정')).toHaveAttribute('aria-selected', 'true');
  await field.press('Enter');
  await expect(node(page, '세부 일정')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.find-count')).toHaveText('2/2');
  await field.press('Shift+Enter');
  await expect(node(page, '일정')).toHaveAttribute('aria-selected', 'true');
  await field.fill('없는 말');
  await expect(page.locator('.find-count')).toHaveText('결과 없음');
  await field.press('Escape');
  await expect(node(page, '일정')).toBeFocused();
});

test('links branches with cross-link arrows', async ({ page }) => {
  await open(page);
  await nodeMenu(page, '세부 일정', '연결선');
  const dialog = page.getByRole('dialog', { name: '연결선' });
  await dialog.getByRole('combobox', { name: '연결할 노드' }).selectOption({ label: '개발' });
  await dialog.getByRole('button', { name: '연결선 추가' }).click();
  await expect(dialog.getByRole('list', { name: '이 노드의 연결선' })).toContainText('개발');
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('[data-link-from=a2][data-link-to=c]')).toHaveCount(1);
  // The link survives a native round trip.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 다운로드', exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(saved.connections).toEqual([{ from: 'a2', to: 'c' }]);
  // Deleting an end removes the link.
  await node(page, '개발').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.cross-link')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.cross-link')).toHaveCount(1);
});

test('styles nodes with markers, emphasis, borders and branch lines', async ({ page }) => {
  await open(page);
  await nodeMenu(page, '기획', '서식');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '굵게' }).click();
  await dialog.getByRole('combobox', { name: '할 일' }).selectOption('todo');
  await dialog.getByRole('button', { name: '⭐' }).click();
  await dialog.locator('.line-color-field').nth(0).getByRole('button', { name: '빨강' }).click();
  await dialog.locator('.line-color-field').nth(1).getByRole('button', { name: '파랑' }).click();
  await dialog.getByRole('combobox', { name: '가지 선 모양' }).selectOption('dashed');
  await dialog.getByRole('button', { name: '서식 적용' }).click();
  const plan = node(page, '기획');
  // Select another node so the border shows its own color, not the selection.
  await node(page, '디자인').click();
  await expect(plan).toHaveCSS('font-weight', '700');
  await expect(plan).toHaveCSS('border-top-color', 'rgb(192, 80, 77)');
  await expect(plan.locator('.node-icon')).toHaveText('⭐');
  for (const id of ['a', 'a1', 'a2'])
    await expect(page.locator(`[data-edge-to=${id}]`)).toHaveAttribute('stroke-dasharray', '8 6');
  await expect(page.locator('[data-edge-to=b]')).not.toHaveAttribute('stroke-dasharray', /./);
  const task = plan.getByRole('checkbox', { name: '기획 완료' });
  await expect(task).toHaveAttribute('aria-checked', 'false');
  await task.click();
  await expect(task).toHaveAttribute('aria-checked', 'true');
  await expect(plan).toHaveClass(/task-done/);
  // The text box still fits beside the markers.
  const text = (await plan.locator('.node-text').boundingBox())!;
  const marker = (await plan.locator('.node-markers').boundingBox())!;
  expect(text.x).toBeGreaterThanOrEqual(marker.x + marker.width);
});

test('exports and imports Markdown and OPML outlines and prints the map', async ({ page }) => {
  await page.addInitScript(() => {
    // Record print requests from the print frame instead of opening a dialog.
    window.print = () => {
      (window.parent as Window & { printed?: string }).printed = document.body.innerHTML;
    };
  });
  await open(page);
  const fileMenu = page.getByRole('button', { name: '파일', exact: true });
  const download = async (label: string) => {
    const done = page.waitForEvent('download');
    await fileMenu.click();
    await page.getByRole('button', { name: label }).click();
    const file = await done;
    return { name: file.suggestedFilename(), text: await readFile((await file.path())!, 'utf8') };
  };
  const markdown = await download('Markdown 다운로드 (.md)');
  expect(markdown.name).toBe('features.md');
  expect(markdown.text).toContain('# 중심\n\n- 기획\n  - 일정\n    - 세부 일정');
  const opml = await download('OPML 다운로드 (.opml)');
  expect(opml.text).toContain('<outline text="세부 일정"/>');
  await fileMenu.click();
  await page.getByRole('button', { name: '인쇄 / PDF로 저장' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { printed?: string }).printed ?? ''))
    .toContain('세부 일정');
  await page.locator('input[type=file]').setInputFiles({
    name: '회의.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 회의\n- 안건\n  - 예산\n- 결정\n'),
  });
  await expect(node(page, '예산')).toHaveAttribute('aria-level', '3');
  await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toContainText('회의');
  await page.locator('input[type=file]').setInputFiles({
    name: 'plan.opml',
    mimeType: 'text/x-opml',
    buffer: Buffer.from(opml.text),
  });
  await expect(node(page, '세부 일정')).toHaveAttribute('aria-level', '4');
});

test('navigates with a minimap and remembers the dark theme and minimap choice', async ({
  page,
}) => {
  await open(page);
  const minimap = page.locator('.minimap');
  await expect(minimap).toBeVisible();
  const root = await box(page, '중심');
  const map = (await minimap.boundingBox())!;
  await page.mouse.click(map.x + 4, map.y + 4);
  const moved = await box(page, '중심');
  expect(moved.x !== root.x || moved.y !== root.y).toBe(true);
  await viewMenu(page, '미니맵 숨기기');
  await expect(minimap).toHaveCount(0);
  await page.getByRole('button', { name: '설정' }).click();
  await page.getByRole('combobox', { name: '화면 테마' }).selectOption('dark');
  await page.getByRole('button', { name: '완료' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('application', { name: '마인드맵 캔버스' })).toHaveCSS(
    'background-color',
    'rgb(20, 26, 24)',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.minimap')).toHaveCount(0);
});
