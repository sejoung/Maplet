import { MAX_MAPLET_BYTES } from '../maplet/codec';
import { multipartUpload } from './upload';

export interface DriveFile {
  id: string;
  name: string;
  version: string;
  etag: string | null;
  parents?: string[];
}
export class DriveConflict extends Error {
  constructor() {
    super('Drive의 파일이 변경되었습니다. 로컬 사본을 유지하고 저장 방법을 선택해 주세요.');
  }
}
export class DriveAuthError extends Error {
  constructor() {
    super(
      'Google Drive 연결이 만료되었거나 취소되었습니다. 다시 연결해 주세요. 로컬 초안은 유지됩니다.',
    );
  }
}

export class DriveClient {
  constructor(
    private readonly token: () => string | null,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.token();
    if (!token) throw new DriveAuthError();
    const response = await this.fetcher(url, {
      cache: 'no-store',
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) throw new DriveAuthError();
    if (response.status === 412) throw new DriveConflict();
    if (!response.ok)
      throw new Error(`Drive 요청이 실패했습니다 (${response.status}). 로컬 사본은 유지됩니다.`);
    return response;
  }

  async open(id: string): Promise<DriveFile & { content: string }> {
    const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
    const metaResponse = await this.request(`${endpoint}?fields=id,name,version,size,parents`);
    const meta = (await metaResponse.json()) as {
      id: string;
      name: string;
      version: string;
      size: string;
      parents?: string[];
    };
    const limit = /\.mup$/i.test(meta.name ?? '') ? 10 * 1024 * 1024 : MAX_MAPLET_BYTES;
    if (Number(meta.size) > limit)
      throw new Error(`Drive 파일 크기는 ${limit / 1024 / 1024} MiB 이하여야 합니다.`);
    const response = await this.request(`${endpoint}?alt=media`);
    return {
      ...meta,
      // A media download validator must not be used to condition a metadata update.
      etag: metaResponse.headers.get('ETag') || null,
      content: await response.text(),
    };
  }

  async folder(id: string): Promise<{ id: string; name: string }> {
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities`,
    );
    const meta = (await response.json()) as {
      id: string;
      name: string;
      mimeType: string;
      trashed?: boolean;
      capabilities?: { canAddChildren?: boolean };
    };
    if (
      meta.id !== id ||
      !meta.name ||
      meta.mimeType !== 'application/vnd.google-apps.folder' ||
      meta.trashed ||
      meta.capabilities?.canAddChildren === false
    )
      throw new Error('저장 폴더를 사용할 수 없습니다. 다른 폴더를 선택해 주세요.');
    return { id: meta.id, name: meta.name };
  }

  async save(
    file: DriveFile,
    content: string,
    overwrite = false,
    name = file.name,
  ): Promise<DriveFile> {
    const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
    const metaResponse = await this.request(`${endpoint}?fields=version`);
    const meta = (await metaResponse.json()) as {
      version: string;
    };
    if (!overwrite && (!file.version || !meta.version))
      throw new Error('Drive 파일의 버전을 확인하지 못했습니다. 다시 연결한 뒤 저장해 주세요.');
    if (!overwrite && meta.version !== file.version) throw new DriveConflict();
    // Drive v3 does not require an exposed ETag; use only the fresh metadata header if present.
    const etag = metaResponse.headers.get('ETag');
    const upload = name === file.name ? null : multipartUpload({ name }, content);
    const response = await this.request(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=${upload ? 'multipart' : 'media'}&fields=id,name,version`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': upload?.contentType ?? 'application/json',
          ...(!overwrite && etag ? { 'If-Match': etag } : {}),
        },
        body: upload?.body ?? content,
      },
    );
    return {
      ...file,
      ...((await response.json()) as Omit<DriveFile, 'etag'>),
      etag: response.headers.get('ETag') || null,
    };
  }

  async create(name: string, content: string, parentId?: string): Promise<DriveFile> {
    const metadata = {
      name,
      mimeType: 'application/json',
      ...(parentId && { parents: [parentId] }),
    };
    const upload = multipartUpload(metadata, content);
    const response = await this.request(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,version',
      {
        method: 'POST',
        headers: { 'Content-Type': upload.contentType },
        body: upload.body,
      },
    );
    return {
      ...((await response.json()) as Omit<DriveFile, 'etag'>),
      etag: response.headers.get('ETag') || null,
    };
  }
}
