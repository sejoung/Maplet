import { AppError } from '../../domain/errors';
import type { DriveWorkspace } from './drive-workspace';
import type { DriveBaseline } from './drive-baseline';
import { keepLocalDrafts, rememberLocalDrafts } from './privacy';

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

export class DraftStore {
  enabled = keepLocalDrafts();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly name = 'maplet-v1',
    private readonly factory: IDBFactory = indexedDB,
  ) {}

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(action);
    this.queue = result;
    return result;
  }

  configure(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    rememberLocalDrafts(enabled);
    return enabled ? Promise.resolve() : this.clear();
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
      (await this.transaction<Draft | undefined>('readonly', (store) => store.get('current'))) ??
      null;
    return this.enabled && keepLocalDrafts() && generation === this.generation ? draft : null;
  }
  async save(draft: Draft): Promise<void> {
    const generation = this.generation;
    await this.enqueue(async () => {
      if (this.enabled && generation === this.generation)
        await this.transaction('readwrite', (store) =>
          this.enabled && keepLocalDrafts() && generation === this.generation
            ? store.put(draft, 'current')
            : store.get('current'),
        );
    });
  }
  async clear(): Promise<void> {
    this.generation++;
    await this.enqueue(() => this.transaction('readwrite', (store) => store.delete('current')));
  }
}
