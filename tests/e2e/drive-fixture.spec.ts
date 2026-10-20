import { test, expect } from '@playwright/test';
import { setupDriveWorkspace } from './support/drive-workspace';

test('starts from an isolated connected workspace without opening the OAuth or Picker UI', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as Window & { pickerViews?: string[] }).pickerViews = opened;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element && node.hasAttribute('data-picker-view'))
            opened.push(node.getAttribute('data-picker-view')!);
    }).observe(document, { childList: true, subtree: true });
  });
  const { state } = await setupDriveWorkspace(page);
  await expect(page.getByRole('status', { name: 'Drive 동기화 상태', exact: true })).toHaveText(
    '동기화 완료',
  );
  expect(
    await page.evaluate(() => (window as Window & { pickerViews?: string[] }).pickerViews),
  ).toEqual([]);
  expect(state.updates).toEqual([]);
  expect(state.creates).toEqual([]);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('browser-test-token');
});
