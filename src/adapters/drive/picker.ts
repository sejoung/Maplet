import type { PickerApi } from './google-types';
import type { DriveItem, PickKind, PickOptions } from './types';
import { DRIVE_MAPLET_MIME_TYPES } from '../formats';

interface PickerAccess extends PickOptions {
  api: PickerApi;
  token: string;
  apiKey: string;
  appId: string;
}

/** Show Google's Picker once; resolves with the chosen item, or null when cancelled. */
export function showPicker(kind: PickKind, access: PickerAccess): Promise<DriveItem | null> {
  const { api } = access;
  return new Promise((resolve) => {
    const view = new api.DocsView(api.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(kind === 'folder')
      .setMode(api.DocsViewMode.LIST);
    if (kind === 'folder')
      view.setParent('root').setMimeTypes('application/vnd.google-apps.folder');
    else view.setMimeTypes(DRIVE_MAPLET_MIME_TYPES.join(','));
    const picker = new api.PickerBuilder()
      .setLocale(access.language)
      .setTitle(access.title)
      .setDeveloperKey(access.apiKey)
      .setAppId(access.appId)
      .setOAuthToken(access.token)
      .setOrigin(window.location.origin)
      .addView(view)
      .setCallback((result) => {
        // Other actions (such as `loaded`) are progress, not an answer.
        if (result.action !== 'picked' && result.action !== 'cancel') return;
        picker.dispose();
        resolve(result.action === 'picked' ? (result.docs?.[0] ?? null) : null);
      })
      .build();
    picker.setVisible(true);
  });
}
