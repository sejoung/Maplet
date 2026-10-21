import { AppError } from '../../domain/errors';
import { translate, type Language } from '../../i18n/core';
import { clearDriveSession } from './session';

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
      revoke(
        token: string,
        callback: (result: { successful: boolean; error?: string }) => void,
      ): void;
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
          reject(new AppError('drive.googleConnectionTimedOut'));
        }, 15000);
        element.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        element.onerror = () => {
          clearTimeout(timer);
          scripts.delete(src);
          element.remove();
          reject(new AppError('drive.couldNotLoadGoogleServices'));
        };
        document.head.append(element);
      }),
    );
  return scripts.get(src)!;
}

export class GoogleConnection {
  private token: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  constructor(readonly config: GoogleConfig) {
    // Every connection starts memory-only, even if an older release stored credentials.
    clearDriveSession();
  }
  getToken = (): string | null => {
    if (Date.now() < this.expiresAt) return this.token;
    this.token = null;
    this.expiresAt = 0;
    return null;
  };
  clearToken(): void {
    this.generation++;
    this.token = null;
    this.expiresAt = 0;
    clearDriveSession();
  }

  async prepare(): Promise<void> {
    await Promise.all([
      script('https://accounts.google.com/gsi/client'),
      script('https://apis.google.com/js/api.js'),
    ]);
    await new Promise<void>((resolve, reject) =>
      window.gapi!.load('picker', {
        callback: resolve,
        onerror: () => reject(new AppError('drive.couldNotLoadFilePicker')),
        timeout: 15000,
        ontimeout: () => reject(new AppError('drive.filePickerConnectionTimedOut')),
      }),
    );
  }

  async connect(): Promise<void> {
    if (!window.google?.accounts) throw new AppError('drive.waitGoogleServicesLoadThen');
    const generation = ++this.generation;
    await new Promise<void>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (result) => {
          if (generation !== this.generation) {
            reject(new AppError('drive.googleDriveConnectionRequestCancelled'));
            return;
          }
          if (result.error || !result.access_token) {
            reject(new AppError('drive.googleDriveAuthorizationCancelled'));
            return;
          }
          this.token = result.access_token;
          this.expiresAt = Date.now() + Math.max(0, (result.expires_in ?? 3600) - 30) * 1000;
          resolve();
        },
        error_callback: () => reject(new AppError('drive.googleSignWindowClosedBlocked')),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  async pick(
    kind: 'file' | 'folder' = 'file',
    language: Language = 'ko',
  ): Promise<GoogleSelection | null> {
    const token = this.getToken();
    if (!token) throw new AppError('drive.connectGoogleDriveFirst');
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
        .setTitle(
          translate(
            kind === 'folder' ? 'drive.pickerFolderTitle' : 'drive.pickerFileTitle',
            language,
          ),
        )
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

  async disconnect(): Promise<void> {
    const token = this.getToken();
    this.clearToken();
    if (!token) return;
    try {
      if (!window.google?.accounts?.oauth2) {
        scripts.delete('https://accounts.google.com/gsi/client');
        await script('https://accounts.google.com/gsi/client');
      }
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('revoke timeout')), 10000);
        try {
          window.google!.accounts.oauth2.revoke(token, (result) => {
            clearTimeout(timer);
            if (result?.successful) resolve();
            else reject(new Error('revoke failed'));
          });
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    } catch {
      throw new AppError('drive.disconnectedDeviceButGooglePermission');
    }
  }
}
