import type { DriveWorkspace } from './drive-workspace';
import type { DriveBaseline } from './drive-baseline';

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
  constructor(
    private readonly name = 'maplet-v1',
    private readonly factory: IDBFactory = indexedDB,
  ) {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error ?? new Error('초안 저장소를 열 수 없습니다.'));
      request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용하고 있습니다.'));
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
        reject(tx.error ?? request.error ?? new Error('초안을 저장하지 못했습니다.'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('초안 저장이 중단되었습니다.'));
      };
    });
  }

  async load(): Promise<Draft | null> {
    return (
      (await this.transaction<Draft | undefined>('readonly', (store) => store.get('current'))) ??
      null
    );
  }
  async save(draft: Draft): Promise<void> {
    await this.transaction('readwrite', (store) => store.put(draft, 'current'));
  }
  async clear(): Promise<void> {
    await this.transaction('readwrite', (store) => store.delete('current'));
  }
}
