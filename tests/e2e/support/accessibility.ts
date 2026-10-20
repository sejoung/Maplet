import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function auditAccessibility(page: Page) {
  // A single-frame page can run all axe rules directly, without a second aggregation page.
  // Cross-origin frames need the builder's normal runPartial/finishRun path.
  const singleFrame = page.frames().length === 1;
  const results = await new AxeBuilder({ page }).setLegacyMode(singleFrame).analyze();
  if (singleFrame && page.frames().length > 1) return new AxeBuilder({ page }).analyze();
  return results;
}
