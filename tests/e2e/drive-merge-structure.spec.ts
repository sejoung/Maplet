import { test, expect } from '@playwright/test';
import { setupDriveWorkspace, renameRoot } from './support/drive-workspace';

const shortcut = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`;
const sync = (page: import('@playwright/test').Page) =>
  page.getByRole('status', { name: 'Drive 동기화 상태', exact: true });

test('resolves deletion versus modification without discarding independent edits', async ({
  page,
}) => {
  const { state, root } = await setupDriveWorkspace(page);
  const original = JSON.parse(state.content);
  const child = page.getByRole('treeitem', { name: original.nodes.left.title, exact: true });
  await child.click();
  await child.press('Delete');
  await renameRoot(page, 'Keep my root');
  original.nodes.left.title = 'Remote child edit';
  state.content = JSON.stringify(original);
  state.version++;
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: '충돌한 변경 확인' });
  await dialog.getByRole('radio', { name: /Drive 변경 유지/ }).check();
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes[root].title).toBe('Keep my root');
  expect(JSON.parse(state.content).nodes.left.title).toBe('Remote child edit');
});

test('requires a structural choice when restoring an edited child of a deleted branch', async ({
  page,
}) => {
  const { state } = await setupDriveWorkspace(page, false);
  const document = JSON.parse(state.content);
  document.nodes.leaf = {
    ...structuredClone(document.nodes.left),
    id: 'leaf',
    title: 'Leaf',
    parentId: 'left',
    children: [],
  };
  document.nodes.left.children = ['leaf'];
  state.content = JSON.stringify(document);
  await page.getByRole('button', { name: 'Google Drive 연결됨', exact: true }).click();
  await page.getByRole('button', { name: 'Drive에서 열기', exact: true }).click();
  await page.getByRole('button', { name: '테스트 파일 선택' }).click();
  const branch = page.getByRole('treeitem', { name: document.nodes.left.title, exact: true });
  await branch.click();
  await branch.press('Delete');
  document.nodes.leaf.title = 'Remote leaf edit';
  state.content = JSON.stringify(document);
  state.version++;
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: '충돌한 변경 확인' });
  await dialog.getByRole('radio', { name: /Drive 변경 유지/ }).check();
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(dialog).toContainText('노드 구조');
  await dialog.getByRole('radio', { name: /Drive 변경 유지/ }).check();
  await dialog.getByRole('button', { name: '선택한 내용 병합 후 저장' }).click();
  await expect(sync(page)).toHaveText('동기화 완료');
  expect(JSON.parse(state.content).nodes.leaf.title).toBe('Remote leaf edit');
  expect(JSON.parse(state.content).nodes.leaf.parentId).toBe('left');
});
