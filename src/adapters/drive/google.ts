import { translate, type Language } from '../../i18n/core';
import { clearDriveSession, readDriveSession, writeDriveSession } from './session';

export interface GoogleConfig {
  clientId: string;
  apiKey: string;
  appId: string;
}
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface PickerResult {
  action: string;
  docs?: { id: string; name: string }[];
}
export interface GoogleSelection {
  id: string;
  name: string;
}
interface Picker {
  setVisible(visible: boolean): void;
  dispose(): void;
}
interface DocsView {
  setIncludeFolders(enabled: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setMode(mode: unknown): DocsView;
  setParent(parentId: string): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
}
interface PickerBuilder {
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): Picker;
}
interface GoogleApi {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (result: TokenResponse) => void;
        error_callback: () => void;
      }): { requestAccessToken(options: { prompt: string }): void };
      revoke(token: string, callback: () => void): void;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (view: unknown) => DocsView;
    DocsViewMode: { LIST: unknown };
    ViewId: { DOCS: unknown; FOLDERS: unknown };
  };
}
declare global {
  interface Window {
    google?: GoogleApi;
    gapi?: {
      load(
        name: string,
        config: {
          callback: () => void;
          onerror: () => void;
          timeout: number;
          ontimeout: () => void;
        },
      ): void;
    };
  }
}

const scripts = new Map<string, Promise<void>>();
function script(src: string): Promise<void> {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const element = document.createElement('script');
        element.src = src;
        element.async = true;
        const timer = window.setTimeout(() => {
          element.remove();
          scripts.delete(src);
          reject(new Error('Google 연결 시간이 초과되었습니다.'));
        }, 15000);
        element.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        element.onerror = () => {
          clearTimeout(timer);
          scripts.delete(src);
          element.remove();
          reject(new Error('Google 연결을 불러오지 못했습니다. 네트워크를 확인해 주세요.'));
        };
        document.head.append(element);
      }),
    );
  return scripts.get(src)!;
}

export class GoogleConnection {
  private token: string | null = null;
  private expiresAt = 0;
  constructor(readonly config: GoogleConfig) {
    const session = readDriveSession(config.clientId);
    this.token = session?.token ?? null;
    this.expiresAt = session?.expiresAt ?? 0;
  }
  getToken = (): string | null => {
    if (Date.now() < this.expiresAt) return this.token;
    clearDriveSession(this.config.clientId);
    return null;
  };
  clearToken(): void {
    this.token = null;
    this.expiresAt = 0;
    clearDriveSession(this.config.clientId);
  }

  async prepare(): Promise<void> {
    await Promise.all([
      script('https://accounts.google.com/gsi/client'),
      script('https://apis.google.com/js/api.js'),
    ]);
    await new Promise<void>((resolve, reject) =>
      window.gapi!.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Picker를 불러오지 못했습니다.')),
        timeout: 15000,
        ontimeout: () => reject(new Error('Picker 연결 시간 초과')),
      }),
    );
  }

  async connect(): Promise<void> {
    if (!window.google?.accounts) throw new Error('Google 연결 준비 후 다시 눌러 주세요.');
    await new Promise<void>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (result) => {
          if (result.error || !result.access_token) {
            reject(new Error('Google Drive 권한이 취소되었습니다.'));
            return;
          }
          this.token = result.access_token;
          this.expiresAt = Date.now() + Math.max(0, (result.expires_in ?? 3600) - 30) * 1000;
          writeDriveSession(this.config.clientId, { token: this.token, expiresAt: this.expiresAt });
          resolve();
        },
        error_callback: () => reject(new Error('Google 로그인 창이 닫혔거나 차단되었습니다.')),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  async pick(
    kind: 'file' | 'folder' = 'file',
    language: Language = 'ko',
  ): Promise<GoogleSelection | null> {
    const token = this.getToken();
    if (!token) throw new Error('먼저 Google Drive에 연결해 주세요.');
    return new Promise((resolve) => {
      const api = window.google!.picker;
      const view = new api.DocsView(api.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(kind === 'folder')
        .setMode(api.DocsViewMode.LIST);
      if (kind === 'folder')
        view.setParent('root').setMimeTypes('application/vnd.google-apps.folder');
      const picker = new window.google!.picker.PickerBuilder()
        .setLocale(language)
        .setTitle(translate(kind === 'folder' ? '저장할 폴더 선택' : '열 파일 선택', language))
        .setDeveloperKey(this.config.apiKey)
        .setAppId(this.config.appId)
        .setOAuthToken(token)
        .setOrigin(window.location.origin)
        .addView(view)
        .setCallback((result) => {
          if (result.action === 'picked' || result.action === 'cancel') {
            picker.dispose();
            resolve(result.action === 'picked' ? (result.docs?.[0] ?? null) : null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  disconnect(): void {
    if (this.token) window.google?.accounts.oauth2.revoke(this.token, () => {});
    this.clearToken();
  }
}
