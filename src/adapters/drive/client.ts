import { AppError } from '../../domain/errors';
import { assertSize, byteLimitFor } from '../limits';
import { multipartUpload } from './upload';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIMEOUT_MS = 30_000;

export interface DriveFile {
  id: string;
  name: string;
  version: string;
  etag: string | null;
  parents?: string[];
}
export class DriveConflict extends AppError {
  constructor() {
    super('Drive의 파일이 변경되었습니다. 로컬 사본을 유지하고 저장 방법을 선택해 주세요.');
  }
}
export class DriveAuthError extends AppError {
  constructor() {
    super(
      'Google Drive 연결이 만료되었거나 취소되었습니다. 다시 연결해 주세요. 현재 편집은 유지됩니다.',
    );
  }
}

export class DriveRequestError extends AppError {
  constructor(readonly status: number) {
    super('Drive 요청이 실패했습니다 ({status}). 로컬 사본은 유지됩니다.', { status });
  }
}

export class DrivePermissionError extends AppError {
  constructor() {
    super(
      '이 파일 또는 폴더에 접근할 수 없거나 Drive 요청이 제한되었습니다. 공유 권한과 저장 위치를 확인해 주세요. 현재 편집은 유지됩니다.',
    );
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

export class DriveClient {
  private creations = new Map<
    string,
    { id: string; content: string; name: string; previous?: { content: string; name: string } }
  >();
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

  async open(id: string): Promise<DriveFile & { content: string }> {
    const endpoint = `${API}/${encodeURIComponent(id)}`;
    const { data: meta, etag } = await this.request(
      `${endpoint}?fields=id,name,version,size,parents`,
      json<{ id: string; name: string; version: string; size: string; parents?: string[] }>,
    );
    assertSize(
      Number(meta.size),
      byteLimitFor(meta.name ?? ''),
      'Drive 파일 크기는 {limit} MiB 이하여야 합니다.',
    );
    const { data: content } = await this.request(`${endpoint}?alt=media`, text);
    // A media download validator must not be used to condition a metadata update.
    return { ...meta, etag, content };
  }

  async folder(id: string): Promise<{ id: string; name: string }> {
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
      throw new AppError('저장 폴더를 사용할 수 없습니다. 다른 폴더를 선택해 주세요.');
    return { id: meta.id, name: meta.name };
  }

  async save(
    file: DriveFile,
    content: string,
    overwrite = false,
    name = file.name,
  ): Promise<DriveFile> {
    const { data: meta, etag } = await this.request(
      `${API}/${encodeURIComponent(file.id)}?fields=version`,
      json<{ version: string }>,
    );
    if (!overwrite && (!file.version || !meta.version))
      throw new AppError('Drive 파일의 버전을 확인하지 못했습니다. 다시 연결한 뒤 저장해 주세요.');
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
    let pending = this.creations.get(operation);
    if (!pending) {
      const { data: generated } = await this.request(
        `${API}/generateIds?count=1&space=drive&type=files`,
        json<{ ids?: string[] }>,
      );
      if (!generated.ids?.[0])
        throw new AppError('Drive 파일 ID를 준비하지 못했습니다. 다시 저장해 주세요.');
      pending = { id: generated.ids[0], content, name };
      this.creations.set(operation, pending);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const upload = multipartUpload(
        {
          id: pending.id,
          name,
          mimeType: 'application/json',
          ...(parentId && { parents: [parentId] }),
        },
        content,
      );
      try {
        const { data: file, etag } = await this.request(
          `${UPLOAD}?uploadType=multipart&fields=id,name,version`,
          json<Omit<DriveFile, 'etag'>>,
          {
            method: 'POST',
            headers: { 'Content-Type': upload.contentType },
            body: upload.body,
          },
        );
        if (file.id !== pending.id) throw new AppError('Drive 저장 대상이 일치하지 않습니다.');
        this.creations.delete(operation);
        return { ...file, etag };
      } catch (error) {
        // 409: a lost response may already have created the pre-generated ID.
        const created = error instanceof DriveRequestError && error.status === 409;
        if (!created && !retryableDriveError(error)) throw error;
        let existing: Awaited<ReturnType<DriveClient['open']>>;
        try {
          existing = await this.open(pending.id);
        } catch (readError) {
          if (
            !(readError instanceof DriveRequestError && readError.status === 404) ||
            attempt === 2
          )
            throw readError;
          await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
          continue;
        }
        const matches = (snapshot: { content: string; name: string }) =>
          existing.content === snapshot.content && existing.name === snapshot.name;
        if (
          (!matches(pending) && (!pending.previous || !matches(pending.previous))) ||
          (parentId && !existing.parents?.includes(parentId))
        )
          throw new DriveConflict();
        if (content === existing.content && name === existing.name) {
          this.creations.delete(operation);
          return existing;
        }
        pending.previous = { content: existing.content, name: existing.name };
        pending.content = content;
        pending.name = name;
        const saved = await this.save(existing, content, false, name);
        this.creations.delete(operation);
        return saved;
      }
    }
    throw new AppError('Drive 저장을 완료하지 못했습니다. 다시 저장해 주세요.');
  }
}
