import { MAX_MAPLET_BYTES } from '../maplet/codec';

export interface DriveFile {
  id: string;
  name: string;
  version: string;
  etag: string | null;
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
    const metaResponse = await this.request(`${endpoint}?fields=id,name,version,size`);
    const meta = (await metaResponse.json()) as {
      id: string;
      name: string;
      version: string;
      size: string;
    };
    const limit = /\.mup$/i.test(meta.name ?? '') ? 10 * 1024 * 1024 : MAX_MAPLET_BYTES;
    if (Number(meta.size) > limit)
      throw new Error(`Drive 파일 크기는 ${limit / 1024 / 1024} MiB 이하여야 합니다.`);
    const response = await this.request(`${endpoint}?alt=media`);
    return {
      ...meta,
      etag: response.headers.get('ETag') ?? metaResponse.headers.get('ETag'),
      content: await response.text(),
    };
  }

  async save(file: DriveFile, content: string, overwrite = false): Promise<DriveFile> {
    const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
    const meta = (await (await this.request(`${endpoint}?fields=version`)).json()) as {
      version: string;
    };
    if (!overwrite && meta.version !== file.version) throw new DriveConflict();
    if (!overwrite && !file.etag)
      throw new Error(
        'Drive 버전 검증 정보가 없습니다. 새 사본 저장 또는 명시적 덮어쓰기를 선택해 주세요.',
      );
    const response = await this.request(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,version`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(!overwrite && file.etag ? { 'If-Match': file.etag } : {}),
        },
        body: content,
      },
    );
    return {
      ...((await response.json()) as Omit<DriveFile, 'etag'>),
      etag: response.headers.get('ETag'),
    };
  }

  async create(name: string, content: string, parentId?: string): Promise<DriveFile> {
    const boundary = `maplet-${crypto.randomUUID()}`;
    const metadata = {
      name,
      mimeType: 'application/json',
      ...(parentId && { parents: [parentId] }),
    };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const response = await this.request(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,version',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    return {
      ...((await response.json()) as Omit<DriveFile, 'etag'>),
      etag: response.headers.get('ETag'),
    };
  }
}
