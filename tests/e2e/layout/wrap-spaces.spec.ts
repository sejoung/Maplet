import { test, expect, type Locator } from '@playwright/test';

async function textLines(content: Locator) {
  return content.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const lines: { top: number; text: string; inset: number }[] = [];
    const left = element.getBoundingClientRect().left;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (let i = 0; i < node.textContent!.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.height) continue;
        let line = lines.find((line) => Math.abs(line.top - rect.top) < 1);
        if (!line) lines.push((line = { top: rect.top, text: '', inset: rect.left - left }));
        line.text += node.textContent![i];
      }
    }
    return lines.map(({ text, inset }) => ({ text: text.trimEnd(), inset }));
  });
}

test('wraps separators without indenting the next line and preserves explicit indentation', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const title = 'ABCDEF GHIJKL  MNOPQR\n  STUVWX';
  await page.locator('input[type=file]').setInputFiles({
    name: 'wrap-spaces.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        formatVersion: 2,
        id: 'root',
        title,
        attr: { style: { width: 81, fontFamily: 'mono' } },
      }),
    ),
  });
  const node = page.getByRole('treeitem');
  await expect(node).toHaveAttribute('aria-label', title);
  await page.evaluate(() => document.fonts.ready);
  const before = await textLines(node.locator('.node-text'));
  await page.screenshot({ path: testInfo.outputPath('wrapped-node.png') });
  expect(before.map((line) => line.text)).toEqual(['ABCDEF', 'GHIJKL', 'MNOPQR', '  STUV', 'WX']);
  await node.press('F2');
  const editor = node.getByRole('textbox');
  await expect(editor).toHaveText(title);
  expect(await textLines(editor)).toEqual(before);
  await editor.press('Enter');
  await expect(node).toHaveAttribute('aria-label', title);
  expect(await textLines(node.locator('.node-text'))).toEqual(before);
});

test('keeps displayed and edited whitespace aligned at fixed and automatic widths', async ({
  page,
}) => {
  await page.goto('/');
  const ideas: Record<string, unknown> = {};
  for (const title of [
    'ABCDEFGHIJKLMNOPQRSTUVW      Z',
    '**ABCDEF**==   ==GHIJKL  MNOPQR',
    '     ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '가나다라마바  사아자차카타  파하',
    'ABCDEF\tGHIJKL\n  MNOPQR',
    'ABCDEF' + ' '.repeat(100),
    'ABCDEFGHIJKLMNOPQRSTUVW      \n  Z',
  ])
    for (const textAlign of ['left', 'center', 'right'])
      for (const width of [81, undefined]) {
        const id = String(Object.keys(ideas).length + 1);
        ideas[id] = {
          id,
          title,
          attr: { style: { fontFamily: 'mono', textAlign, width } },
        };
      }
  await page.locator('input[type=file]').setInputFiles({
    name: 'wrap-spaces-matrix.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ formatVersion: 3, ideas })),
  });
  await expect(page.getByRole('treeitem')).toHaveCount(Object.keys(ideas).length);
  await page.evaluate(() => document.fonts.ready);
  for (const id of Object.keys(ideas)) {
    const node = page.locator(`[data-node-id="${id}"]`);
    await node.focus();
    await expect(node).toHaveAttribute('aria-selected', 'true');
    const before = await textLines(node.locator('.node-text'));
    await node.press('F2');
    const editor = node.getByRole('textbox');
    expect(await textLines(editor), `node ${id}`).toEqual(before);
    await editor.press('Escape');
  }
});
