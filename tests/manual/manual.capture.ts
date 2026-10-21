import { test, expect, type Locator, type Page } from '@playwright/test';
import { setupDriveWorkspace } from '../e2e/support/drive-workspace';
import { readFileSync } from 'node:fs';

// Read rather than imported: Playwright loads JSON modules only with import attributes.
const catalog = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`src/i18n/locales/${name}.json`, 'utf8'));
const korean = catalog('ko');
const english = catalog('en');
type Key = keyof typeof import('../../src/i18n/locales/ko.json');
const languages = {
  ko: {
    labels: korean,
    titles: {
      root: '제품 출시 계획',
      plan: '기획',
      research: '시장 조사',
      schedule: '일정 수립',
      design: '디자인',
      ui: 'UI 시안',
      brand: '브랜드 가이드',
      dev: '개발',
      api: 'API',
      app: '모바일 앱',
      qa: 'QA',
      marketing: '마케팅',
      launch: '출시 행사',
      sns: 'SNS 캠페인',
      support: '고객 지원',
      faq: 'FAQ 작성',
      cs: '상담 교육',
      added: '배포 자동화',
      notes: '경쟁 제품 5종 비교\n사용자 인터뷰 12명',
      find: '출시',
      folder: 'Maplet 작업 폴더',
    },
  },
  en: {
    labels: english,
    titles: {
      root: 'Product launch',
      plan: 'Planning',
      research: 'Market research',
      schedule: 'Schedule',
      design: 'Design',
      ui: 'UI mockups',
      brand: 'Brand guide',
      dev: 'Development',
      api: 'API',
      app: 'Mobile app',
      qa: 'QA',
      marketing: 'Marketing',
      launch: 'Launch event',
      sns: 'Social campaign',
      support: 'Support',
      faq: 'Write FAQ',
      cs: 'Agent training',
      added: 'Release pipeline',
      notes: 'Compared 5 competing products\nInterviewed 12 users',
      find: 'launch',
      folder: 'Maplet workspace',
    },
  },
};
type Language = keyof typeof languages;
let language: Language = 'ko';
const label = (key: Key) => languages[language].labels[key] as string;
const title = (id: keyof (typeof languages)['ko']['titles']) => languages[language].titles[id];
const out = (name: string) => `public/manual/images/${language}/${name}.png`;
const idea = (id: string, extra: object = {}) => ({
  id,
  title: title(id as keyof (typeof languages)['ko']['titles']),
  ...extra,
});
const style = (value: object) => ({ attr: { style: value } });
/** A realistic sample map used throughout the manual. */
const sample = () =>
  JSON.stringify({
    formatVersion: 3,
    id: 'manual',
    ideas: {
      1: idea('root', {
        ideas: {
          1: idea('plan', {
            ...style({ icon: '🎯', branchColor: '#3b6fb6' }),
            ideas: {
              1: idea('research', { attr: { style: { task: 'done' }, notes: title('notes') } }),
              2: idea('schedule', style({ task: 'todo' })),
            },
          }),
          2: idea('design', {
            ...style({ background: '#fbf0db', borderColor: '#b7791f' }),
            ideas: {
              1: idea('ui'),
              2: idea('brand', { attr: { hyperlink: 'https://example.com/brand' } }),
            },
          }),
          3: idea('dev', {
            ...style({ branchColor: '#397760', fontWeight: 'bold' }),
            ideas: {
              1: idea('api'),
              2: idea('app', style({ icon: '🔥' })),
              3: idea('qa', style({ icon: '❗' })),
            },
          }),
          '-4': idea('marketing', {
            ...style({ branchColor: '#c0504d', lineStyle: 'dashed' }),
            ideas: { 1: idea('launch', style({ icon: '📅' })), 2: idea('sns') },
          }),
          '-5': idea('support', { ideas: { 1: idea('faq'), 2: idea('cs') } }),
        },
      }),
    },
    links: [{ ideaIdFrom: 'research', ideaIdTo: 'sns' }],
  });

const node = (page: Page, id: keyof (typeof languages)['ko']['titles']) =>
  page.getByRole('treeitem', { name: title(id), exact: true });
const fit = (page: Page) =>
  page.getByRole('button', { name: label('common.fitScreen'), exact: true }).click();
async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: `${title('root')}.mup`,
    mimeType: 'application/json',
    buffer: Buffer.from(sample()),
  });
  await expect(node(page, 'root')).toBeVisible();
  await fit(page);
}
/** A screenshot around several elements with some breathing room. */
async function around(page: Page, name: string, targets: Locator[], pad = 24) {
  const boxes = await Promise.all(targets.map(async (target) => (await target.boundingBox())!));
  const view = page.viewportSize()!;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(view.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(view.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  await page.screenshot({ path: out(name), clip: { x, y, width: right - x, height: bottom - y } });
}
const center = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test.beforeEach(async ({ page }, info) => {
  language = info.project.name as Language;
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maplet:minimap', 'on');
      localStorage.removeItem('maplet:theme');
    } catch {
      // Storage is optional for the editor.
    }
  });
});

test('overview, editing and menus', async ({ page }) => {
  await open(page);
  await node(page, 'root').click();
  await page.screenshot({ path: out('overview') });
  await around(page, 'header', [page.locator('.app-header'), page.locator('.editor-toolbar')], 0);

  await node(page, 'dev').click();
  await page.keyboard.press('Tab');
  await page.getByRole('textbox', { name: label('common.nodeTitle') }).fill(title('added'));
  await around(
    page,
    'editing',
    [node(page, 'dev'), page.getByRole('textbox', { name: label('common.nodeTitle') })],
    60,
  );
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1280, height: 1000 });
  await fit(page);
  await node(page, 'design').click({ button: 'right' });
  await around(page, 'node-menu', [
    page.getByRole('menu', { name: label('common.nodeMenu') }),
    node(page, 'design'),
  ]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 760 });
  await fit(page);

  const canvas = page.getByRole('application', { name: label('canvas.mindMapCanvas') });
  const area = (await canvas.boundingBox())!;
  await page.mouse.click(area.x + 60, area.y + 40, { button: 'right' });
  await around(
    page,
    'canvas-menu',
    [page.getByRole('menu', { name: label('editor.canvasMenu') })],
    40,
  );
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: label('header.file'), exact: true }).click();
  await around(page, 'file-menu', [
    page.locator('.file-menu .menu-items'),
    page.getByRole('button', { name: label('header.file'), exact: true }),
  ]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: label('toolbar.view'), exact: true }).click();
  await around(page, 'view-menu', [
    page.locator('.view-menu .menu-items'),
    page.getByRole('button', { name: label('toolbar.view'), exact: true }),
  ]);
});

test('selection and dragging', async ({ page }) => {
  await open(page);
  await node(page, 'api').click();
  await node(page, 'app').click({ modifiers: ['Shift'] });
  await node(page, 'qa').click({ modifiers: ['Shift'] });
  await page.screenshot({ path: out('multi-select') });

  await fit(page);
  const first = await center(node(page, 'faq'));
  const last = await center(node(page, 'cs'));
  await page.keyboard.down('Shift');
  await page.mouse.move(first.box.x - 30, first.box.y - 20);
  await page.mouse.down();
  await page.mouse.move(last.box.x + last.box.width + 30, last.box.y + last.box.height + 20, {
    steps: 6,
  });
  await around(page, 'marquee', [page.locator('.selection-marquee'), node(page, 'support')], 40);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  // Reparent: drop the social campaign node next to Design.
  await node(page, 'root').click();
  const sns = await center(node(page, 'sns'));
  const target = (await node(page, 'design').boundingBox())!;
  await page.mouse.move(sns.box.x + 6, sns.y);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width + 8 + 6, target.y + target.height / 2, {
    steps: 10,
  });
  await page.screenshot({ path: out('drag-reparent') });
  await page.keyboard.press('Escape');
  await page.mouse.up();

  // Insert between siblings: bring "QA" just above "API".
  await fit(page);
  const qa = await center(node(page, 'qa'));
  const api = (await node(page, 'api').boundingBox())!;
  await page.mouse.move(qa.box.x + 6, qa.y);
  await page.mouse.down();
  await page.mouse.move(api.x + 6, api.y - qa.box.height / 2 - 8, { steps: 10 });
  await page.screenshot({ path: out('drag-insert') });
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('formatting, notes, links and connections', async ({ page }) => {
  await open(page);
  await around(
    page,
    'styled-nodes',
    [node(page, 'plan'), node(page, 'research'), node(page, 'design'), node(page, 'brand')],
    40,
  );
  await page.setViewportSize({ width: 1280, height: 1240 });
  await node(page, 'plan').click({ button: 'right' });
  await page.getByRole('menuitem', { name: label('common.style') }).click();
  await around(page, 'style-dialog', [page.getByRole('dialog')], 0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 760 });

  await node(page, 'research').click({ button: 'right' });
  await page.getByRole('menuitem', { name: label('common.notes') }).click();
  await around(page, 'notes', [page.getByRole('dialog')], 0);
  await page.keyboard.press('Escape');

  await fit(page);
  await node(page, 'research').click({ button: 'right' });
  await page.getByRole('menuitem', { name: label('common.connections') }).click();
  await around(page, 'connections-dialog', [page.getByRole('dialog')], 0);
  await page.keyboard.press('Escape');
  await around(
    page,
    'connections',
    [node(page, 'research'), node(page, 'sns'), page.locator('.cross-link')],
    30,
  );
});

test('find, focus, levels and minimap', async ({ page }) => {
  await open(page);
  await node(page, 'root').click();
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('searchbox', { name: label('canvas.searchNodes') }).fill(title('find'));
  await page.screenshot({ path: out('find') });
  await page.keyboard.press('Escape');

  await node(page, 'dev').click({ button: 'right' });
  await page.getByRole('menuitem', { name: label('menu.showOnlyBranch') }).click();
  await page.screenshot({ path: out('focus') });
  await page.getByRole('button', { name: label('common.showWholeMap') }).click();

  await page.getByRole('button', { name: label('toolbar.view'), exact: true }).click();
  await page.getByRole('button', { name: label('menu.mainBranchesOnly'), exact: true }).click();
  await fit(page);
  await page.screenshot({ path: out('levels') });
  await around(page, 'minimap', [page.locator('.minimap')], 16);
});

test('settings, dark theme and shortcuts', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: label('common.settings') }).click();
  await around(page, 'settings', [page.getByRole('dialog')], 0);
  await page.getByRole('combobox', { name: label('settings.theme') }).selectOption('dark');
  await page.getByRole('button', { name: label('common.done') }).click();
  await node(page, 'root').click();
  await page.screenshot({ path: out('dark') });
  await page.evaluate(() => localStorage.removeItem('maplet:theme'));
  await page.reload();
  await page
    .getByRole('button', { name: label('toolbar.keyboardShortcuts') })
    .first()
    .click();
  await around(page, 'shortcuts', [page.getByRole('dialog')], 0);
});

test('Google Drive', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await setupDriveWorkspace(page, true, 'all', title('folder'));
  await expect(
    page.getByRole('status', { name: label('drive.driveSyncStatus'), exact: true }),
  ).toHaveText(label('drive.synced'));
  await around(page, 'drive-status', [page.locator('.drive-control')], 12);
  await page.locator('.drive-button').click();
  await around(
    page,
    'drive-dialog',
    [page.getByRole('dialog', { name: 'Google Drive', exact: true })],
    0,
  );
});
