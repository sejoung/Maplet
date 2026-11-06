import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('uses native saving by default, restores it, and exports MindMup separately', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/v2-rich.mup');
  const root = page.getByRole('treeitem').first();
  await root.press('F2');
  await page.getByRole('textbox', { name: '노드 제목' }).fill('Native document');
  await page.getByRole('textbox', { name: '노드 제목' }).press('Enter');
  await page.getByRole('button', { name: '파일', exact: true }).click();
  let downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.mup 다운로드 (MindMup 호환)', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('v2-rich.mup');
  await expect(page.getByLabel('저장하지 않은 변경', { exact: true })).toBeVisible();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 다운로드', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('v2-rich.maplet');
  const path = (await download.path())!;
  const raw = JSON.parse(await readFile(path, 'utf8'));
  expect(raw).toMatchObject({ format: 'maplet', version: 1 });
  expect(raw.nodes[raw.roots[0]].title).toBe('Native document');
  expect(raw.compatibility.mindmup.nodes[raw.roots[0]].raw.resources).toEqual({
    image: 'base64-original',
  });
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('treeitem', { name: 'Native document', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '파일', exact: true }).click();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.mup 다운로드 (MindMup 호환)', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(exported.title).toBe('Native document');
  expect(exported.resources).toEqual({ image: 'base64-original' });
});

test('rejects future native versions without replacing the current map', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'future.maplet',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"maplet","version":99}'),
  });
  await expect(page.getByRole('alert')).toContainText('버전');
  await expect(page.getByRole('treeitem', { name: '중심 주제', exact: true })).toBeVisible();
});

test('recovers an existing MUP draft and downloads it as a native document', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maplet-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        {
          content: '{"id":1,"title":"Legacy draft"}',
          original: '{"id":1,"title":"Original"}',
          savedContent: '{"id":1,"title":"Original"}',
          filename: 'legacy.mup',
          updatedAt: 1,
        },
        'current',
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: '초안 복구' }).click();
  await expect(page.getByRole('treeitem', { name: 'Legacy draft', exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.maplet 다운로드', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('legacy.maplet');
  const raw = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(raw.compatibility.mindmup.original).toBe('{"id":1,"title":"Original"}');
});
