import type { Page } from '@playwright/test';
import type { DriveWorkspace } from '../../../src/adapters/storage/drive-workspace';

export async function seedDriveWorkspace(page: Page, workspace: DriveWorkspace) {
  await page.addInitScript((workspace) => {
    // Every page gets its own initial state; a refresh must still require reconnection.
    const marker = 'maplet:test:drive-fixture';
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, 'ready');
    localStorage.setItem('maplet:drive:public-test-client', JSON.stringify(workspace));
    (window as Window & { mapletDriveFixture?: boolean }).mapletDriveFixture = true;
  }, workspace);
}
