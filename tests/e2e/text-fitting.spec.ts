import { test, expect } from '@playwright/test';

test('fits actual font widths and consistent padding across sizes, fonts and root weights', async ({
  page,
}) => {
  const ideas: Record<string, unknown> = {};
  let index = 0;
  for (const fontFamily of ['sans', 'serif', 'mono'])
    for (const fontSize of [12, 15, 20])
      for (const title of [
        'iiiiiiiiiiiiiiiiiiiiiiiiiiii',
        'WWMMWWWiiiWWWMWMWWWWWW',
        '한국어와 English가 함께 있는 긴 제목입니다',
      ])
        for (const manual of [false, true]) {
          const style = { fontFamily, fontSize, height: 900, ...(manual ? { width: 156 } : {}) };
          ideas[String(++index)] = {
            id: `r${index}`,
            title,
            attr: { style },
            ideas: { 1: { id: `c${index}`, title, attr: { style } } },
          };
        }
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'fonts.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ formatVersion: 3, ideas })),
  });
  await expect(page.getByRole('treeitem')).toHaveCount(index * 2);
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.locator('.mind-node').evaluateAll((nodes) =>
    nodes.flatMap((element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const text = node.querySelector('.node-text')!;
      const lines = [...text.children] as HTMLElement[];
      const scale = node.getBoundingClientRect().width / node.offsetWidth;
      const lineHeight = parseFloat(style.lineHeight);
      const insetY = 2 * (parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth));
      const insetX = 2 * (parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth));
      const expectedHeight = Math.max(36, lines.length * lineHeight + insetY);
      const range = document.createRange();
      let longest = 0;
      const issues: string[] = [];
      if (Math.abs(node.offsetHeight - expectedHeight) > 1) issues.push('blank space below text');
      for (const [i, line] of lines.entries()) {
        range.selectNodeContents(line);
        longest = Math.max(longest, range.getBoundingClientRect().width / scale);
        if (Math.abs(line.offsetHeight - lineHeight) > 1 || line.scrollWidth > line.clientWidth)
          issues.push('unexpected extra wrapping or horizontal overflow');
        if (i === lines.length - 1) continue;
        const probe = document.createElement('span');
        probe.style.cssText =
          'position:absolute;white-space:pre;width:max-content;visibility:hidden;';
        const next =
          [
            ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
              lines[i + 1].textContent ?? '',
            ),
          ][0]?.segment ?? '';
        probe.textContent = line.textContent + next;
        node.append(probe);
        if (probe.getBoundingClientRect().width / scale <= line.clientWidth - 1.25)
          issues.push('line wraps before using available width');
        probe.remove();
      }
      // Automatic widths hug the longest rendered line; fixed widths deliberately follow the user.
      const automatic = Number(node.dataset.nodeId!.slice(1)) % 2 === 1;
      if (automatic && Math.abs(node.offsetWidth - Math.max(56, longest + insetX + 1)) > 1.5)
        issues.push('excessive space to the right');
      return issues.length
        ? [{ title: node.getAttribute('aria-label'), font: style.font, issues }]
        : [];
    }),
  );
  expect(failures).toEqual([]);
});

test('widening reflows text and removes the old height without changing font size', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'old-height.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        formatVersion: 2,
        id: 'root',
        title: '오른쪽 아래에 빈 공간이 남지 않고 제목의 줄 수에 맞춰 높이가 조절되어야 합니다',
        attr: { style: { width: 88, height: 900 } },
      }),
    ),
  });
  const node = page.getByRole('treeitem');
  await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
  const before = (await node.boundingBox())!;
  const grip = (await node.getByRole('button', { name: '노드 크기 조절' }).boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 180, grip.y + grip.height / 2 + 60, { steps: 8 });
  await expect.poll(async () => (await node.boundingBox())!.height).toBeLessThan(before.height);
  await page.mouse.up();
  await expect(node).toHaveCSS('font-size', '15px');
  const dimensions = await node.evaluate((element) => {
    const node = element as HTMLElement;
    const text = node.querySelector('.node-text')!;
    return { height: node.offsetHeight, lines: text.children.length };
  });
  expect(dimensions.height).toBe(dimensions.lines * 23 + 14);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(node).toHaveCSS('width', '88px');
});
