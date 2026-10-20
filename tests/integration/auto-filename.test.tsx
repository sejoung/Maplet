// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorProps } from '../../src/components/Editor';
import { DocumentName } from '../../src/components/DocumentName';
import { App } from '../../src/app/App';
import { DraftStore, type Draft } from '../../src/adapters/storage/drafts';
import { createMap } from '../../src/domain/commands';
import { serializeMaplet } from '../../src/adapters/maplet/codec';

const editor = vi.hoisted(() => ({ current: null as EditorProps | null }));
// Keep App naming, history and persistence real; Canvas rendering is covered by E2E.
vi.mock('../../src/components/Editor', () => ({
  Editor: (props: EditorProps) => {
    editor.current = props;
    return <DocumentName filename={props.filename} onChange={props.onFilenameChange} />;
  },
}));
vi.mock('../../src/app/driveConnection', () => ({
  google: null,
  drive: null,
  config: { clientId: '', apiKey: '', appId: '' },
}));

const store = new DraftStore();
const props = () => editor.current!;
const rename = (title: string, id = props().map.roots[0]) =>
  act(() => {
    expect(props().onRename(id, title)).toBe(true);
  });

beforeEach(async () => {
  localStorage.clear();
  await store.configure(true);
  await store.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await store.clear();
});

async function mount() {
  const load = vi.spyOn(DraftStore.prototype, 'load');
  const view = render(<App />);
  await act(async () => {
    await load.mock.results.at(-1)!.value;
  });
  load.mockRestore();
  return view;
}

async function persist() {
  const save = vi.spyOn(DraftStore.prototype, 'save');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
    expect(save).toHaveBeenCalledOnce();
    await save.mock.results[0].value;
  });
  save.mockRestore();
  return (await store.load())!;
}

it('waits for a changed root title and assigns the filename only once', async () => {
  await mount();
  rename('중심 주제');
  expect(props().filename).toBe('제목 없음.maplet');
  rename('  업무 / 계획\n2026  ');
  expect(props().filename).toBe('업무 _ 계획 2026.maplet');
  rename('다음 제목');
  expect(props().filename).toBe('업무 _ 계획 2026.maplet');
});

it.each(['제목 없음.maplet', '직접 정한 이름.maplet'])(
  'keeps an explicitly selected filename %s through root edits',
  async (name) => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /^파일 이름 변경:/ }));
    const input = screen.getByRole('textbox', { name: '파일 이름' });
    fireEvent.change(input, { target: { value: name.replace(/\.maplet$/, '') } });
    fireEvent.keyDown(input, { key: 'Enter' });
    rename('중심 제목 변경');
    expect(props().filename).toBe(name);
  },
);

it('keeps automatic naming available after a child is added and renamed', async () => {
  await mount();
  act(() => props().onAdd());
  rename('하위 항목부터 작성', props().selected);
  expect(props().filename).toBe('제목 없음.maplet');
  rename('나중에 정한 중심 제목');
  expect(props().filename).toBe('나중에 정한 중심 제목.maplet');
});

it.each(['mup', 'maplet'])('keeps an imported placeholder filename from a %s file', async (ext) => {
  await mount();
  const source =
    ext === 'mup'
      ? '{"id":1,"title":"불러온 중심 주제"}'
      : serializeMaplet(createMap('불러온 중심 주제'));
  const file = Object.assign(new File([source], `제목 없음.${ext}`), {
    text: async () => source,
  });
  await act(async () => props().onOpen(file));
  expect(props().map.nodes[props().map.roots[0]].title).toBe('불러온 중심 주제');
  rename('불러온 맵 편집');
  expect(props().filename).toBe('제목 없음.maplet');
});

it.each([true, false, undefined])(
  'restores automatic naming with filenamePending=%s including legacy drafts',
  async (filenamePending) => {
    const draft: Draft = {
      content: serializeMaplet(createMap('복구 전 제목')),
      original: null,
      filename: '제목 없음.maplet',
      filenamePending,
      savedContent: '',
      updatedAt: 1,
    };
    await store.save(draft);
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '초안 복구' }));
    rename('복구 후 이름');
    expect(props().filename).toBe(filenamePending ? '복구 후 이름.maplet' : draft.filename);
  },
);

it('persists pending naming after child edits and persists the assigned name through a second recovery', async () => {
  let view = await mount();
  // Install timers before edits so the real debounce is controlled without wall-clock waits.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  act(() => props().onAdd());
  rename('하위 항목부터 작성', props().selected);
  expect((await persist()).filenamePending).toBe(true);
  vi.useRealTimers();
  view.unmount();
  view = await mount();
  fireEvent.click(screen.getByRole('button', { name: '초안 복구' }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  rename('복구 후 이름');
  const saved = await persist();
  expect(saved).toMatchObject({ filename: '복구 후 이름.maplet', filenamePending: false });
  vi.useRealTimers();
  view.unmount();
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '초안 복구' }));
  rename('다시 고친 루트');
  expect(props().filename).toBe('복구 후 이름.maplet');
});
