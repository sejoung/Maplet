import { test, expect } from '@playwright/test';
import { auditAccessibility } from './support/accessibility';
import { readFile } from 'node:fs/promises';

test('starts with one neutral node and exposes tools only when requested', async ({ page }) => {
  await test.step('timing:load', () => page.goto('/'));
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '블루', exact: true })).toHaveCount(0);
  await expect(page.getByText(/생각의 주인|생각이 자라는|YOUR SPACE|작은 팁/)).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: '편집 도구' })).toBeVisible();
  const root = page.getByRole('treeitem', { name: '중심 주제', exact: true });
  await expect(root).toHaveCSS('background-color', 'rgb(228, 240, 234)');
  await root.press('Tab');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await expect(root).toHaveAttribute('aria-selected', 'false');
  await expect(root).toHaveCSS('background-color', 'rgb(228, 240, 234)');
  await expect(page.getByRole('treeitem', { name: '새 노드', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
});

test('opens, edits inline, undoes, exports and reimports without losing metadata', async ({
  page,
}) => {
  await test.step('timing:load', () => page.goto('/'));
  await test.step('timing:import', () =>
    page.locator('input[type=file]').setInputFiles('tests/fixtures/v2-rich.mup'));
  const node = page.getByRole('treeitem', { name: '발견하기', exact: true });
  await node.click();
  await node.press('Tab');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await expect(input).toBeFocused();
  await input.fill('회귀 방지');
  await input.press('Enter');
  await expect(page.getByRole('treeitem', { name: '회귀 방지', exact: true })).toBeFocused();
  await expect(input).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '새 노드', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('button', { name: '.mup 다운로드 (MindMup 호환)', exact: true }).click();
  const path = await (await downloaded).path();
  const exported = await readFile(path!, 'utf8');
  const raw = JSON.parse(exported);
  expect(raw.ideas['-2'].vendor).toEqual({ a: [1, 2] });
  expect(raw.resources).toEqual({ image: 'base64-original' });
  await test.step('timing:import', async () => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('input[type=file]').setInputFiles({
      name: 'reimported.mup',
      mimeType: 'application/json',
      buffer: Buffer.from(exported),
    });
    await expect(page.getByRole('button', { name: /^파일 이름 변경:/ })).toHaveText('reimported');
  });
  await expect(page.getByRole('treeitem', { name: '회귀 방지', exact: true })).toBeVisible();
});

test('keeps the current map on import failure and offers draft recovery on reload', async ({
  page,
}) => {
  await page.clock.install();
  await test.step('timing:load', () => page.goto('/'));
  await test.step('timing:import', () =>
    page.locator('input[type=file]').setInputFiles('tests/fixtures/v1.mup'));
  await page.getByRole('treeitem', { name: '왼쪽', exact: true }).press('F2');
  const input = page.getByRole('textbox', { name: '노드 제목' });
  await input.fill('복구할 생각');
  await input.press('Enter');
  await test.step('timing:draft-flush', () => page.clock.fastForward(250));
  await expect(page.getByText('브라우저에 초안 저장됨', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await test.step('timing:import', () =>
    page.locator('input[type=file]').setInputFiles({
      name: 'bad.mup',
      mimeType: 'application/json',
      buffer: Buffer.from('{bad'),
    }));
  await expect(page.getByRole('alert')).toContainText('JSON');
  await expect(page.getByRole('treeitem', { name: '복구할 생각', exact: true })).toBeVisible();
  await test.step('timing:reload', () => page.reload());
  await page.getByRole('button', { name: '초안 복구' }).click();
  await expect(page.getByRole('treeitem', { name: '복구할 생각', exact: true })).toBeVisible();
});

test('creates maps from the toolbar and supports keyboard expansion and collapse', async ({
  page,
}) => {
  await test.step('timing:load', () => page.goto('/'));
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('button', { name: '새 맵', exact: true }).click();
  await page.getByRole('textbox', { name: '중심 주제' }).fill('내 프로젝트');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  const root = page.getByRole('treeitem', { name: '내 프로젝트', exact: true });
  await root.press('Tab');
  await page.getByRole('textbox', { name: '노드 제목' }).fill('첫 단계');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await page.getByRole('treeitem', { name: '첫 단계', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await expect(page.getByRole('treeitem', { name: '새 노드', exact: true })).toBeVisible();
  const zoom = page.getByRole('status', { name: '확대 비율' });
  const before = await zoom.textContent();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await expect(zoom).not.toHaveText(before!);
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  await page.getByRole('button', { name: '내 프로젝트 접기', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '첫 단계', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '내 프로젝트 펼치기', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '첫 단계', exact: true })).toBeVisible();
});

test('has accessible controls and no horizontal page overflow', async ({ page }) => {
  await test.step('timing:load', () => page.goto('/'));
  await expect(page.getByRole('tree', { name: '마인드맵' })).toBeVisible();
  const audit = await test.step('timing:accessibility', () => auditAccessibility(page));
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, issue: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const help = page.getByRole('button', { name: '단축키 도움말' });
  if (!(await help.isVisible()))
    await page.getByRole('button', { name: '더보기', exact: true }).click();
  await help.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
