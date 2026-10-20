import { test, expect } from '@playwright/test';
import { auditAccessibility } from './support/accessibility';

test('detects unnamed buttons in the main page and in a cross-origin frame', async ({ page }) => {
  await page.route('http://127.0.0.1:4173/audit-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><title>Audit fixture</title></head>
        <body><main><h1>Audit fixture</h1><button id="main-probe"></button></main></body></html>`,
    }),
  );
  await page.goto('/audit-fixture');
  const invalid = await auditAccessibility(page);
  expect(invalid.violations.map((violation) => violation.id)).toContain('button-name');
  await page.locator('#main-probe').evaluate((button) => {
    button.textContent = 'Named button';
  });
  expect((await auditAccessibility(page)).violations).toEqual([]);
  await page.route('https://audit.example/frame', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Frame</title></head><body><main><h1>Frame</h1><button id="frame-probe"></button></main></body></html>',
    }),
  );
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'audit-frame';
    frame.title = 'Audit frame';
    frame.src = 'https://audit.example/frame';
    document.querySelector('main')!.append(frame);
  });
  await expect(page.frameLocator('#audit-frame').locator('#frame-probe')).toBeVisible();
  const framed = await auditAccessibility(page);
  expect(framed.violations.find((violation) => violation.id === 'button-name')?.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: expect.arrayContaining(['#audit-frame']),
      }),
    ]),
  );
});
