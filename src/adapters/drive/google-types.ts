/** The slices of Google Identity Services and the Picker API that Maplet calls. */
export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
export interface PickerResult {
  action: string;
  docs?: { id: string; name: string }[];
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
export interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (view: unknown) => DocsView;
  DocsViewMode: { LIST: unknown };
  ViewId: { DOCS: unknown; FOLDERS: unknown };
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
  picker: PickerApi;
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
