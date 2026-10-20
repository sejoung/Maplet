import { test, expect, type Locator } from '@playwright/test';
import { inspectInlineLayoutMatrix, type InlineLayoutCase } from './support/inline-layout';

async function geometry(node: Locator) {
  return node.evaluate((element) => {
    const node = element as HTMLElement;
    const content = node.querySelector<HTMLElement>('.node-text, .inline-node-editor')!;
    const box = node.getBoundingClientRect(),
      text = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      textX: text.x,
      textY: text.y,
      textWidth: text.width,
      textHeight: text.height,
      font: style.fontFamily,
      size: style.fontSize,
      lineHeight: style.lineHeight,
      align: style.textAlign,
    };
  });
}

test('keeps the same node and text area before, during and after editing across fonts and alignments', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/');
  const title = '한글과 English (AVATAR), 👨‍👩‍👧‍👦 é  두 칸 공백\n다음 줄\t끝';
  const ideas: Record<string, unknown> = {};
  const cases: InlineLayoutCase[] = [];
  for (const fontFamily of ['sans', 'serif', 'mono'])
    for (const fontSize of [12, 15, 20])
      for (const [i, textAlign] of ['left', 'center', 'right'].entries()) {
        const style = { fontFamily, fontSize, textAlign, ...(i % 2 ? {} : { width: 150 }) };
        const index = cases.length + 1;
        const root = `root-${index}`,
          child = `child-${index}`;
        ideas[String(index)] = {
          id: root,
          title,
          attr: { style },
          ideas: { 1: { id: child, title, attr: { style } } },
        };
        cases.push({ id: i % 2 ? child : root, style });
      }
  expect(cases).toHaveLength(27);
  await page.locator('input[type=file]').setInputFiles({
    name: 'inline-matrix.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ formatVersion: 3, ideas })),
  });
  await expect(page.getByRole('treeitem')).toHaveCount(cases.length * 2);
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.evaluate(inspectInlineLayoutMatrix, { cases, title });
  expect(failures).toEqual([]);
});

test('previews height and connectors while typing and commits the same layout as a single undo step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'live-edit.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        formatVersion: 2,
        id: 'root',
        title: '처음',
        attr: { style: { width: 150 }, 'maplet:position': { x: 80, y: 80 } },
        ideas: {
          1: { id: 'child', title: '하위', attr: { 'maplet:position': { x: 500, y: 80 } } },
        },
      }),
    ),
  });
  const node = page.locator('[data-node-id=root]');
  const before = await geometry(node);
  const edge = page.locator('[data-edge-to=child]');
  const originalPath = await edge.getAttribute('d');
  await node.dblclick();
  const input = page.getByRole('textbox', { name: '노드 제목' });
  const title = '입력한 긴 제목과 English가 같은 영역에서 줄바꿈됩니다. '.repeat(8);
  await input.fill(title);
  const preview = await geometry(node);
  expect(preview.height).toBeGreaterThan(240);
  expect(preview.width).toBe(before.width);
  await expect(input).toBeFocused();
  await expect(edge).not.toHaveAttribute('d', originalPath!);
  const previewPath = await edge.getAttribute('d');
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toHaveCount(0);
  await input.press('Enter');
  expect(await geometry(node)).toEqual(preview);
  await expect(edge).toHaveAttribute('d', previewPath!);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await geometry(node)).toEqual(before);
  await expect(node).toHaveAttribute('aria-label', '처음');
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  expect(await geometry(node)).toEqual(preview);
  await node.press('F2');
  await input.fill('짧게');
  expect((await geometry(node)).height).toBeLessThan(preview.height);
  await input.press('Escape');
  expect(await geometry(node)).toEqual(preview);
  await node.press('F2');
  await expect(input).toHaveValue(title);
  await input.press('Escape');
});
