import { describe, expect, it } from 'vitest';
import { DraftStore } from '../../src/adapters/storage/drafts';

describe('IndexedDB recovery', () => {
  it('atomically saves, loads and deletes a local draft including original backup', async () => {
    const store = new DraftStore(`draft-test-${crypto.randomUUID()}`);
    expect(await store.load()).toBeNull();
    const draft = {
      content: '{"id":1,"title":"복구"}',
      original: 'original bytes',
      filename: '나의 맵.mup',
      savedContent: 'before',
      updatedAt: 123,
    };
    await store.save(draft);
    expect(await store.load()).toEqual(draft);
    await store.save({ ...draft, content: 'new' });
    expect((await store.load())!.content).toBe('new');
    await store.clear();
    expect(await store.load()).toBeNull();
  });
  it('surfaces storage failures rather than claiming the draft was saved', async () => {
    const store = new DraftStore('failed', {
      open: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory);
    await expect(
      store.save({ content: 'x', original: null, filename: 'x', savedContent: '', updatedAt: 0 }),
    ).rejects.toThrow('blocked');
  });
});

it('deletes existing and queued drafts when storage is disabled, including writes from another tab', async () => {
  const name = `privacy-${crypto.randomUUID()}`;
  const store = new DraftStore(name);
  const otherTab = new DraftStore(name);
  const draft = {
    content: 'private',
    original: null,
    filename: 'x',
    savedContent: '',
    updatedAt: 0,
  };
  try {
    await store.save(draft);
    const pending = [store.save(draft), store.save(draft)];
    await store.configure(false);
    await Promise.all(pending);
    await store.save(draft);
    await otherTab.save(draft);
    expect(await store.load()).toBeNull();
    const reloaded = new DraftStore(name);
    expect(reloaded.enabled).toBe(false);
    expect(await reloaded.load()).toBeNull();
    await store.configure(true);
    expect(await store.load()).toBeNull();
    await store.save(draft);
    expect(await store.load()).toEqual(draft);
  } finally {
    localStorage.removeItem('maplet:keep-local-drafts');
    await store.clear();
  }
});

it('does not offer a stale recovery when draft reading overlaps disabling storage', async () => {
  const store = new DraftStore(`read-privacy-${crypto.randomUUID()}`);
  await store.save({
    content: 'private',
    original: null,
    filename: 'x',
    savedContent: '',
    updatedAt: 0,
  });
  const reading = store.load();
  const clearing = store.configure(false);
  try {
    expect(await reading).toBeNull();
    await clearing;
    expect(await store.load()).toBeNull();
  } finally {
    await clearing;
    localStorage.removeItem('maplet:keep-local-drafts');
    await store.clear();
  }
});
