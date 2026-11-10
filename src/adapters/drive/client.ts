import { AppError } from '../../domain/errors';
import { assertSize } from '../limits';
import { formatOf } from '../formats';
import { multipartUpload } from './upload';
import type { DriveFile, DriveFiles, DriveFolder, OpenedDriveFile, SaveOptions } from './types';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIMEOUT_MS = 30_000;
/** Upload attempts for one creation; a pre-generated ID makes repeating it safe. */
const CREATE_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;
const backoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
export class DriveConflict extends AppError {
  constructor() {
    super('drive.driveFileChangedKeepLocal');
  }
}
export class DriveAuthError extends AppError {
  constructor() {
    super('drive.googleDriveAccessExpiredRevoked');
  }
}

export class DriveRequestError extends AppError {
  constructor(readonly status: number) {
    super('drive.driveRequestFailedLocalCopy', { status });
  }
}

export class DrivePermissionError extends AppError {
  constructor() {
    super('drive.fileFolderInaccessibleDriveRequests');
  }
}

/** Network failures, timeouts, throttling and server errors may succeed when repeated. */
export const retryableDriveError = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof DriveRequestError &&
    (error.status === 408 || error.status === 429 || error.status >= 500));

interface Reply<T> {
  data: T;
  etag: string | null;
}
const json = <T>(response: Response) => response.json() as Promise<T>;
const text = (response: Response) => response.text();
const isStatus = (error: unknown, status: number) =>
  error instanceof DriveRequestError && error.status === status;

interface Snapshot {
  content: string;
  name: string;
}
/** A creation in progress: its reserved ID, what was last sent, and what was sent before. */
interface Creation extends Snapshot {
  id: string;
  previous?: Snapshot;
}

export class DriveClient implements DriveFiles {
  private creations = new Map<string, Creation>();
  constructor(
    private readonly token: () => string | null,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  /** The timeout covers the response body as well, so a stalled download cannot hang a save. */
  private async request<T>(
    url: string,
    read: (response: Response) => Promise<T>,
    init: RequestInit = {},
  ): Promise<Reply<T>> {
    const token = this.token();
    if (!token) throw new DriveAuthError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, {
        cache: 'no-store',
        ...init,
        signal: controller.signal,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw new DriveAuthError();
      if (response.status === 403) throw new DrivePermissionError();
      if (response.status === 412) throw new DriveConflict();
      if (!response.ok) throw new DriveRequestError(response.status);
      // Created only now, so a timeout during fetch cannot leave an unobserved rejection.
      const timedOut = new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new DriveRequestError(408)), {
          once: true,
        }),
      );
      const data = await Promise.race([read(response), timedOut]);
      return { data, etag: response.headers.get('ETag') || null };
    } catch (error) {
      if (controller.signal.aborted) throw new DriveRequestError(408);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async open(id: string): Promise<OpenedDriveFile> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const opened = await this.readSnapshot(id);
      if (opened) return opened;
    }
    throw new DriveConflict();
  }

  private async readSnapshot(id: string): Promise<OpenedDriveFile | null> {
    const endpoint = `${API}/${encodeURIComponent(id)}`;
    const { data: meta, etag } = await this.request(
      `${endpoint}?fields=id,name,version,size,parents`,
      json<{ id: string; name: string; version: string; size: string; parents?: string[] }>,
    );
    assertSize(
      Number(meta.size),
      formatOf(meta.name ?? '').maxBytes,
      'drive.driveFilesMustMibSmaller',
    );
    const { data: content } = await this.request(`${endpoint}?alt=media`, text);
    // A merge base must pair content with the version it actually belongs to.
    const verified = await this.request(`${endpoint}?fields=version`, json<{ version: string }>);
    if (!meta.version || !verified.data.version) throw new AppError('drive.versionCheckFailed');
    if (meta.version !== verified.data.version) return null;
    // A media download validator must not be used to condition a metadata update.
    return { ...meta, etag, content };
  }

  async folder(id: string): Promise<DriveFolder> {
    const { data: meta } = await this.request(
      `${API}/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities`,
      json<{
        id: string;
        name: string;
        mimeType: string;
        trashed?: boolean;
        capabilities?: { canAddChildren?: boolean };
      }>,
    );
    if (
      meta.id !== id ||
      !meta.name ||
      meta.mimeType !== 'application/vnd.google-apps.folder' ||
      meta.trashed ||
      meta.capabilities?.canAddChildren === false
    )
      throw new AppError('drive.saveFolderUnavailablePleaseChoose');
    return { id: meta.id, name: meta.name };
  }

  async save(
    file: DriveFile,
    content: string,
    { overwrite = false, name = file.name }: SaveOptions = {},
  ): Promise<DriveFile> {
    const { data: meta, etag } = await this.request(
      `${API}/${encodeURIComponent(file.id)}?fields=version`,
      json<{ version: string }>,
    );
    if (!overwrite && (!file.version || !meta.version))
      throw new AppError('drive.versionCheckFailed');
    if (!overwrite && meta.version !== file.version) throw new DriveConflict();
    // Drive v3 does not require an exposed ETag; use only the fresh metadata header if present.
    const upload = name === file.name ? null : multipartUpload({ name }, content);
    const saved = await this.request(
      `${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=${upload ? 'multipart' : 'media'}&fields=id,name,version`,
      json<Omit<DriveFile, 'etag'>>,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': upload?.contentType ?? 'application/json',
          ...(!overwrite && etag ? { 'If-Match': etag } : {}),
        },
        body: upload?.body ?? content,
      },
    );
    return { ...file, ...saved.data, etag: saved.etag };
  }

  async create(
    name: string,
    content: string,
    parentId?: string,
    operation: string = crypto.randomUUID(),
  ): Promise<DriveFile> {
    const creation = this.creations.get(operation) ?? (await this.reserve(name, content));
    // Kept until it succeeds, so retrying the same operation reuses the reserved ID.
    this.creations.set(operation, creation);
    const file = await this.uploadReserved(creation, { name, content }, parentId);
    this.creations.delete(operation);
    return file;
  }

  private async reserve(name: string, content: string): Promise<Creation> {
    const { data } = await this.request(
      `${API}/generateIds?count=1&space=drive&type=files`,
      json<{ ids?: string[] }>,
    );
    if (!data.ids?.[0]) throw new AppError('drive.couldNotPrepareDriveFile');
    return { id: data.ids[0], content, name };
  }

  private async uploadReserved(
    creation: Creation,
    next: Snapshot,
    parentId?: string,
  ): Promise<DriveFile> {
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
      try {
        return await this.upload(creation.id, next, parentId);
      } catch (error) {
        // 409: a lost response may already have created the pre-generated ID.
        if (!isStatus(error, 409) && !retryableDriveError(error)) throw error;
        const existing = await this.openCreated(creation.id, attempt === CREATE_ATTEMPTS - 1);
        if (existing) return this.recoverCreation(creation, existing, next, parentId);
        await backoff(attempt);
      }
    }
    throw new AppError('drive.couldNotFinishSavingDrive');
  }

  private async upload(id: string, { name, content }: Snapshot, parentId?: string) {
    const upload = multipartUpload(
      { id, name, mimeType: 'application/json', ...(parentId && { parents: [parentId] }) },
      content,
    );
    const { data: file, etag } = await this.request(
      `${UPLOAD}?uploadType=multipart&fields=id,name,version`,
      json<Omit<DriveFile, 'etag'>>,
      { method: 'POST', headers: { 'Content-Type': upload.contentType }, body: upload.body },
    );
    if (file.id !== id) throw new AppError('drive.saveTargetMismatch');
    return { ...file, etag };
  }

  /** The file behind a reserved ID, or null while Drive does not list it yet. */
  private async openCreated(id: string, last: boolean): Promise<OpenedDriveFile | null> {
    try {
      return await this.open(id);
    } catch (error) {
      if (last || !isStatus(error, 404)) throw error;
      return null;
    }
  }

  /**
   * Adopt a file an unacknowledged upload created, if it holds what this operation sent
   * (now or in its previous round); anything else was written by someone else.
   */
  private async recoverCreation(
    creation: Creation,
    existing: OpenedDriveFile,
    next: Snapshot,
    parentId?: string,
  ): Promise<DriveFile> {
    const matches = (snapshot: Snapshot) =>
      existing.content === snapshot.content && existing.name === snapshot.name;
    const ours =
      matches(creation) || (creation.previous !== undefined && matches(creation.previous));
    if (!ours || (parentId && !existing.parents?.includes(parentId))) throw new DriveConflict();
    if (matches(next)) return existing;
    creation.previous = { content: existing.content, name: existing.name };
    creation.content = next.content;
    creation.name = next.name;
    return this.save(existing, next.content, { name: next.name });
  }
}
