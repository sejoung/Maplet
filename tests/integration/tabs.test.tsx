// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorProps } from '../../src/components/Editor';
import { App } from '../../src/app/App';
import { useDriveWorkspace } from '../../src/app/useDriveWorkspace';
import { DraftStore, type Draft } from '../../src/adapters/storage/drafts';
import {
  readDriveWorkspace,
  readDriveWorkspaceOwner,
  writeDriveWorkspace,
  writeTabWorkspace,
} from '../../src/adapters/storage/drive-workspace';
import { FRESH_TAB, type TabSession } from '../../src/adapters/storage/tab-session';
import { createMap } from '../../src/domain/commands';
import { serializeMaplet } from '../../src/adapters/maplet/codec';

const editor = vi.hoisted(() => ({ current: null as EditorProps | null }));
vi.mock('../../src/components/Editor', () => ({
  Editor: (props: EditorProps) => {
    editor.current = props;
    return null;
  },
}));
vi.mock('../../src/app/driveConnection', () => ({
  google: null,
  drive: null,
  config: { clientId: '', apiKey: '', appId: '' },
}));

let name: string;
const props = () => editor.current!;
const tab = (overrides: Partial<TabSession> = {}): TabSession => ({
  ...FRESH_TAB,
  id: 'mine',
  ...overrides,
});
const store = (key: string) => new DraftStore(name, indexedDB, key);
const draft = (title: string, updatedAt: number, changed = true): Draft => {
  const content = serializeMaplet(createMap(title));
  return {
    content,
    original: null,
    filename: `${title}.maplet`,
    savedContent: changed ? '' : content,
    updatedAt,
  };
};
beforeEach(() => {
  name = `tabs-${crypto.randomUUID()}`;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function mount(session: TabSession) {
  const drafts = store('tab:mine');
  const others = vi.spyOn(DraftStore.prototype, 'others');
  render(<App drafts={drafts} tab={session} />);
  if (session.newMap === null)
    await act(async () => {
      await vi.waitFor(() => expect(others).toHaveBeenCalled());
      await others.mock.results.at(-1)!.value;
    });
  others.mockRestore();
  return drafts;
}

it('offers drafts of closed tabs only, and takes a recovered one into this tab', async () => {
  await store('tab:open').save(draft('Open tab', 3));
  await store('tab:closed').save(draft('Closed tab', 2));
  await store('tab:saved').save(draft('Saved tab', 4, false));
  const drafts = await mount(tab({ live: new Set(['open']) }));
  expect(screen.getByText(/Closed tab\.maplet/)).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '초안 복구' }));
    await vi.waitFor(async () => expect(await store('tab:closed').load()).toBeNull());
  });
  expect(props().filename).toBe('Closed tab.maplet');
  expect((await drafts.load())!.filename).toBe('Closed tab.maplet');
  expect((await store('tab:open').load())!.filename).toBe('Open tab.maplet');
  expect(await store('tab:saved').load()).toBeNull();
});

it('offers the next closed draft after one is deleted', async () => {
  await store('tab:newer').save(draft('Newer', 2));
  await store('tab:older').save(draft('Older', 1));
  await mount(tab());
  expect(screen.getByText(/Newer\.maplet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '초안 삭제' }));
  expect(await screen.findByText(/Older\.maplet/)).toBeInTheDocument();
  expect(await store('tab:newer').load()).toBeNull();
});

it('starts a tab opened for a new map with that title and no recovery', async () => {
  await store('tab:closed').save(draft('Closed tab', 2));
  await mount(tab({ newMap: '업무 계획' }));
  expect(props().map.nodes[props().map.roots[0]].title).toBe('업무 계획');
  expect(props().filename).toBe('업무 계획.maplet');
  expect(props().dirty).toBe(true);
  expect(screen.queryByRole('button', { name: '초안 복구' })).toBeNull();
  expect((await store('tab:closed').load())!.filename).toBe('Closed tab.maplet');
});

it('creates a new map in place until the tab has work, then in a new tab', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await mount(tab());
  const create = (title: string) => {
    act(() => props().onNew());
    fireEvent.change(screen.getByLabelText('중심 주제'), { target: { value: title } });
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  };
  create('First');
  expect(open).not.toHaveBeenCalled();
  expect(props().filename).toBe('First.maplet');
  create('Second');
  expect(open).toHaveBeenCalledWith('/#new=Second', '_blank', 'noopener');
  expect(props().filename).toBe('First.maplet');
  expect(screen.queryByRole('dialog')).toBeNull();
});

const folder = { id: 'folder', name: 'Maps' };
const file = { id: 'file', name: 'map.maplet', version: '7', etag: null, parents: ['folder'] };
const shared = { folder, file, source: null };
const folderOnly = { folder, file: null, source: null };
it.each([
  ['a reopened tab resumes its own file', tab({ reopened: true }), 'own', 'own'],
  [
    'a reopened tab without its own record keeps only the folder',
    tab({ reopened: true }),
    null,
    'folder',
  ],
  ['a new tab takes a file no open tab uses', tab({ live: new Set(['other']) }), null, 'shared'],
  ['a new tab leaves a file an open tab uses', tab({ live: new Set(['owner']) }), null, 'folder'],
  ['a new map tab keeps only the folder', tab({ newMap: 'Plan' }), null, 'folder'],
] as const)('%s', (_label, session, own, expected) => {
  writeDriveWorkspace('client', shared, 'owner');
  const mine = { folder, file: { ...file, id: 'own-file' }, source: null };
  if (own) writeTabWorkspace('client', mine);
  const { result } = renderHook(() => useDriveWorkspace('client', session));
  expect(result.current.saveFolder).toEqual(folder);
  expect(result.current.pending?.workspace).toEqual(
    expected === 'own' ? mine : expected === 'shared' ? shared : folderOnly,
  );
});

it('leaves the shared record alone at startup and claims it once this tab changes', () => {
  writeDriveWorkspace('client', shared, 'owner');
  const { result } = renderHook(() =>
    useDriveWorkspace('client', tab({ live: new Set(['owner']) })),
  );
  expect(readDriveWorkspaceOwner('client')).toBe('owner');
  // Settling on the same folder-only target is not a change.
  act(() => result.current.setPending(null));
  expect(readDriveWorkspaceOwner('client')).toBe('owner');
  const created = { ...file, id: 'created' };
  act(() => result.current.setDriveFile(created));
  expect(readDriveWorkspace('client')).toEqual({ folder, file: created, source: null });
  expect(readDriveWorkspaceOwner('client')).toBe('mine');
  act(() => result.current.setSaveFolder(null));
  expect(readDriveWorkspace('client')).toBeNull();
});
