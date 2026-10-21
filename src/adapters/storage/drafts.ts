import { AppError } from '../../domain/errors';
import type { DriveWorkspace } from './drive-workspace';
import type { DriveBaseline } from './drive-baseline';
import { keepLocalDrafts, rememberLocalDrafts } from './privacy';
import { draftOwner } from './tab-session';

export interface Draft {
  content: string;
  original: string | null;
  filename: string;
  filenamePending?: boolean;
  savedContent: string;
  savedFilename?: string;
  updatedAt: number;
  drive?: DriveWorkspace | null;
  driveBaseline?: DriveBaseline | null;
}

/** A draft left by another tab, keyed as stored. */
export interface StoredDraft {
  key: string;
  draft: Draft;
}

export class DraftStore {
  enabled = keepLocalDrafts();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  /** `key` is this tab's slot; `current` is the single slot of releases before tabs. */
  constructor(
    private readonly name = 'maplet-v1',
    private readonly factory: IDBFactory = indexedDB,
    private readonly key = 'current',
  ) {}

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(action);
    this.queue = result;
    return result;
  }

  configure(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    rememberLocalDrafts(enabled);
    return enabled ? Promise.resolve() : this.clear(true);
  }

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () =>
        reject(request.error ?? new AppError('drive.couldNotOpenDraftStorage'));
      request.onblocked = () => reject(new AppError('drive.anotherTabUsingDraftStorage'));
      request.onsuccess = () => resolve(request.result);
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? request.error ?? new AppError('drive.couldNotSaveDraft'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new AppError('drive.draftSavingInterrupted'));
      };
    });
  }

  async load(): Promise<Draft | null> {
    if (!this.enabled || !keepLocalDrafts()) {
      await this.clear();
      return null;
    }
    const generation = this.generation;
    await this.queue.catch(() => {});
    const draft =
      (await this.transaction<Draft | undefined>('readonly', (store) => store.get(this.key))) ??
      null;
    return this.enabled && keepLocalDrafts() && generation === this.generation ? draft : null;
  }
  /** Drafts of tabs that are no longer open, newest first. */
  async others(live: ReadonlySet<string>): Promise<StoredDraft[]> {
    if (!this.enabled || !keepLocalDrafts()) return [];
    const generation = this.generation;
    await this.queue.catch(() => {});
    // Keys and values from one transaction so they pair up.
    let keys: IDBRequest<IDBValidKey[]> | undefined;
    const drafts = await this.transaction<Draft[]>('readonly', (store) => {
      keys = store.getAllKeys();
      return store.getAll();
    });
    if (!this.enabled || !keepLocalDrafts() || generation !== this.generation) return [];
    return keys!.result
      .map((key, index) => ({ key: String(key), draft: drafts[index] }))
      .filter(({ key }) => {
        const owner = draftOwner(key);
        return key !== this.key && !(owner && live.has(owner));
      })
      .sort((a, b) => b.draft.updatedAt - a.draft.updatedAt);
  }
  /** Delete another tab's draft, e.g. after taking it over; this tab's writes continue. */
  async remove(key: string): Promise<void> {
    await this.enqueue(() => this.transaction('readwrite', (store) => store.delete(key)));
  }
  async save(draft: Draft): Promise<void> {
    const generation = this.generation;
    await this.enqueue(async () => {
      if (this.enabled && generation === this.generation)
        await this.transaction('readwrite', (store) =>
          this.enabled && keepLocalDrafts() && generation === this.generation
            ? store.put(draft, this.key)
            : store.get(this.key),
        );
    });
  }
  /** Delete this tab's draft, or with `everyTab` every tab's (turning storage off). */
  async clear(everyTab = false): Promise<void> {
    this.generation++;
    await this.enqueue(() =>
      this.transaction('readwrite', (store) => (everyTab ? store.clear() : store.delete(this.key))),
    );
  }
}
