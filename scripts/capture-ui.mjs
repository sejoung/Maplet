import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('treeitem', { name: '중심 주제', exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/start.png' });
  await page.locator('input[type=file]').setInputFiles({
    name: '프로젝트 계획.mup',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        formatVersion: 2,
        id: 'root',
        title: '프로젝트 계획',
        ideas: {
          '-1': {
            id: 'research',
            title: '자료 조사',
            ideas: { 1: { id: 'reference', title: '참고 자료 정리' } },
          },
          '-2': { id: 'schedule', title: '일정' },
          1: {
            id: 'tasks',
            title: '할 일',
            ideas: { 1: { id: 'draft', title: '초안 작성' }, 2: { id: 'review', title: '검토' } },
          },
        },
      }),
    ),
  });
  await page.getByRole('treeitem', { name: '프로젝트 계획', exact: true }).waitFor();
  await page.getByText('브라우저에 초안 저장됨', { exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/desktop.png' });
  for (const [title, dx, dy] of [
    ['참고 자료 정리', -50, -70],
    ['검토', 55, 80],
  ]) {
    const box = await page.getByRole('treeitem', { name: title, exact: true }).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  }
  await page.getByText('브라우저에 초안 저장됨', { exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/free-positioning.png' });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await mobile.goto('http://127.0.0.1:5173');
  await mobile.getByRole('treeitem', { name: '중심 주제', exact: true }).waitFor();
  await mobile.screenshot({ path: 'docs/screenshots/mobile.png' });
  const icon = await browser.newPage({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  });
  const svg = await readFile('public/icon.svg', 'utf8');
  await icon.setContent(
    `<style>body{margin:0}svg{display:block;width:180px;height:180px}</style>${svg}`,
  );
  await icon.screenshot({ path: 'public/apple-touch-icon.png', omitBackground: true });
  console.log(
    JSON.stringify({
      errors,
      screenshots: [
        'docs/screenshots/desktop.png',
        'docs/screenshots/free-positioning.png',
        'docs/screenshots/mobile.png',
      ],
    }),
  );
} finally {
  await browser.close();
}
