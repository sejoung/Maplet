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
