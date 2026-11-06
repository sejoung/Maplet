import type { Page } from '@playwright/test';

/** Switches the UI language through Settings, the only place that offers it. */
export async function switchLanguage(page: Page, language: 'ko' | 'en') {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(설정|Settings)$/ })
    .click();
  const settings = page.getByRole('dialog', { name: /^(설정|Settings)$/ });
  await settings.getByRole('combobox', { name: /^(언어|Language)$/ }).selectOption(language);
  await settings.getByRole('button', { name: /^(완료|Done)$/ }).click();
}
