import { test, expect, type Page } from '@playwright/test';
import { auditAccessibility } from './support/accessibility';

/** Every contents link has a section and every screenshot loads with a description. */
async function checkManual(manual: Page, contents: string) {
  const targets = await manual
    .getByRole('navigation', { name: contents })
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
  expect(targets).toHaveLength(14);
  for (const target of targets) await expect(manual.locator(target)).toHaveCount(1);
  const images = manual.locator('main img');
  expect(await images.count()).toBeGreaterThan(20);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('alt', /.+/);
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  expect((await auditAccessibility(manual)).violations).toEqual([]);
}

test('opens the Korean user guide from the header and the shortcut help', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const guide = page.getByRole('link', { name: '사용 설명서', exact: true });
  await expect(guide).toHaveAttribute('href', 'manual/index.html');
  await expect(guide).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: '단축키 도움말' }).first().click();
  await expect(page.getByRole('link', { name: '전체 사용 설명서 보기 ↗' })).toHaveAttribute(
    'href',
    'manual/index.html',
  );
  await page.keyboard.press('Escape');
  const [manual] = await Promise.all([context.waitForEvent('page'), guide.click()]);
  await manual.waitForLoadState();
  await expect(manual).toHaveTitle('Maplet 사용 설명서');
  await expect(manual.locator('html')).toHaveAttribute('lang', 'ko');
  await checkManual(manual, '목차');
  // Switch to the English guide and back to the editor from there.
  await manual.getByRole('link', { name: 'English', exact: true }).click();
  await expect(manual).toHaveTitle('Maplet User Guide');
  await manual.getByRole('link', { name: 'Open the editor' }).click();
  await expect(manual.getByRole('application', { name: '마인드맵 캔버스' })).toBeVisible();
});

test('opens the English user guide when the interface is in English', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: '언어' }).selectOption('en');
  const guide = page.getByRole('link', { name: 'User guide', exact: true });
  await expect(guide).toHaveAttribute('href', 'manual/en/index.html');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).first().click();
  await expect(page.getByRole('link', { name: 'Open the full user guide ↗' })).toHaveAttribute(
    'href',
    'manual/en/index.html',
  );
  await page.keyboard.press('Escape');
  const [manual] = await Promise.all([context.waitForEvent('page'), guide.click()]);
  await manual.waitForLoadState();
  await expect(manual).toHaveTitle('Maplet User Guide');
  await expect(manual.locator('html')).toHaveAttribute('lang', 'en');
  await expect(manual.getByRole('heading', { level: 1 })).toHaveText('Maplet User Guide');
  await checkManual(manual, 'Contents');
  await manual.getByRole('link', { name: '한국어', exact: true }).click();
  await expect(manual).toHaveTitle('Maplet 사용 설명서');
});
