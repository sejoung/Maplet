// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDraftPersistence } from '../../src/app/useDraftPersistence';
import type { Draft, DraftStore } from '../../src/adapters/storage/drafts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(enabled = true) {
  const save = vi.fn<(draft: Draft) => Promise<void>>().mockResolvedValue(undefined);
  const store = { save } as unknown as DraftStore;
  const status = vi.fn(),
    error = vi.fn();
  const draft = {
    content: 'first edit',
    original: null,
    filename: '제목 없음.maplet',
    filenamePending: true,
    savedContent: 'original',
    savedFilename: '제목 없음.maplet',
    drive: null,
    driveBaseline: null,
  };
  const view = renderHook(
    ({ draft, enabled }) => useDraftPersistence(store, draft, enabled, status, error),
    { initialProps: { draft, enabled } },
  );
  return { ...view, save, status, error, draft };
}
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

it('waits until enabled and debounces edits into the latest complete draft snapshot', async () => {
  const view = setup(false);
  await tick(500);
  expect(view.save).not.toHaveBeenCalled();
  expect(view.status).not.toHaveBeenCalled();
  view.rerender({ draft: view.draft, enabled: true });
  await tick(249);
  expect(view.save).not.toHaveBeenCalled();
  const latest = {
    ...view.draft,
    content: 'latest edit',
    filename: 'Assigned.maplet',
    filenamePending: false,
  };
  view.rerender({ draft: latest, enabled: true });
  await tick(249);
  expect(view.save).not.toHaveBeenCalled();
  await tick(1);
  expect(view.save).toHaveBeenCalledExactlyOnceWith({ ...latest, updatedAt: Date.now() });
  expect(view.status).toHaveBeenLastCalledWith('app.draftSavedBrowser');
  expect(view.error).not.toHaveBeenCalled();
});

it.each(['disable', 'unmount'] as const)('cancels pending draft writes on %s', async (action) => {
  const view = setup();
  await tick(100);
  if (action === 'disable') view.rerender({ draft: view.draft, enabled: false });
  else view.unmount();
  await tick(1000);
  expect(view.save).not.toHaveBeenCalled();
  expect(view.status).not.toHaveBeenCalledWith('app.draftSavedBrowser');
});

it.each(['resolve', 'reject'] as const)(
  'serializes saves and ignores stale status when the earlier write will %s',
  async (outcome) => {
    const view = setup();
    let finish!: () => void;
    view.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = () => (outcome === 'resolve' ? resolve() : reject(new Error('old write')));
        }),
    );
    await tick(250);
    expect(view.save).toHaveBeenCalledOnce();
    const latest = { ...view.draft, content: 'new edit while saving' };
    view.rerender({ draft: latest, enabled: true });
    await tick(250);
    expect(view.save).toHaveBeenCalledOnce();
    expect(view.status).not.toHaveBeenCalledWith('app.draftSavedBrowser');
    await act(async () => finish());
    expect(view.save).toHaveBeenCalledTimes(2);
    expect(view.save.mock.calls.map(([draft]) => draft.content)).toEqual([
      view.draft.content,
      latest.content,
    ]);
    expect(
      view.status.mock.calls.filter(([message]) => message === 'app.draftSavedBrowser'),
    ).toHaveLength(1);
    expect(view.error).not.toHaveBeenCalled();
  },
);

it('reports a failed current save and allows the next edit to persist', async () => {
  const view = setup();
  view.save.mockRejectedValueOnce(new Error('storage unavailable'));
  await tick(250);
  expect(view.status).toHaveBeenLastCalledWith('app.draftSaveFailed');
  expect(view.error).toHaveBeenCalledExactlyOnceWith('app.couldNotSaveBrowserDraft');
  view.rerender({ draft: { ...view.draft, content: 'retry after editing' }, enabled: true });
  await tick(250);
  expect(view.save).toHaveBeenCalledTimes(2);
  expect(view.status).toHaveBeenLastCalledWith('app.draftSavedBrowser');
});
