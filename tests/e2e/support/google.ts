import type { Page } from '@playwright/test';

// Simulate only Google's external SDK. App authorization, Picker setup and fetch stay real.
export async function mockGoogle(page: Page) {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { ...window.google, accounts: { oauth2: {
      initTokenClient: (config) => ({ requestAccessToken: () => {
        const root = document.documentElement;
        root.dataset.authorizations = String(Number(root.dataset.authorizations || 0) + 1);
        config.callback({ access_token: 'browser-test-token', expires_in: 3600 });
      } }),
      revoke: (_token, callback) => callback()
    } } };`,
    }),
  );
  await page.route('https://apis.google.com/js/api.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      class DocsView {
        constructor(id) { this.id = id; }
        setIncludeFolders() { return this; }
        setSelectFolderEnabled(enabled) { this.folders = enabled; return this; }
        setMode() { return this; }
        setParent(parent) { this.parent = parent; return this; }
        setMimeTypes(mimeTypes) { this.mimeTypes = mimeTypes; return this; }
      }
      class PickerBuilder {
        setLocale(locale) { this.locale = locale; return this; }
        setTitle(title) { this.title = title; return this; }
        setDeveloperKey() { return this; }
        setAppId() { return this; }
        setOAuthToken() { return this; }
        setOrigin() { return this; }
        addView(view) { this.view = view; return this; }
        setCallback(callback) { this.callback = callback; return this; }
        build() {
          const dialog = document.createElement('div');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-label', this.title);
          dialog.setAttribute('data-picker-locale', this.locale);
          dialog.setAttribute('data-picker-view', this.view.id);
          if (this.view.parent) dialog.setAttribute('data-picker-parent', this.view.parent);
          dialog.style.cssText = 'position:fixed;inset:20px;z-index:1000;background:white;padding:24px';
          const choose = document.createElement('button');
          choose.textContent = this.view.folders ? '테스트 폴더 선택' : '테스트 파일 선택';
          choose.onclick = () => this.callback({ action: 'picked', docs: [{ id: this.view.folders ? 'chosen-folder' : 'chosen-file', name: this.view.folders ? 'Maplet 작업 폴더' : 'source.maplet' }] });
          const cancel = document.createElement('button');
          cancel.textContent = '선택 취소';
          cancel.onclick = () => this.callback({ action: 'cancel' });
          dialog.append(choose, cancel);
          return { setVisible: () => document.body.append(dialog), dispose: () => dialog.remove() };
        }
      }
      window.google = window.google || {};
      window.google.picker = { PickerBuilder, DocsView, DocsViewMode: { LIST: 'list' }, ViewId: { DOCS: 'docs', FOLDERS: 'folders' } };
      window.gapi = { load: (_name, options) => options.callback() };
    `,
    }),
  );
}
