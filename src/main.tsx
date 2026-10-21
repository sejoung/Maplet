import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import { getLanguage, initializeLanguage } from './i18n/locale';
import { translate } from './i18n/core';
import { clearDriveSession } from './adapters/drive/session';
import { applyTheme, readTheme } from './components/theme';
import { DraftStore } from './adapters/storage/drafts';
import { draftKey, startTab } from './adapters/storage/tab-session';

initializeLanguage();
applyTheme(readTheme());
// Migration: older releases stored Drive credentials; none are ever restored.
clearDriveSession();

const root = document.getElementById('root')!;
// Static hosting cannot send `frame-ancestors`; refuse to run inside another site's frame
// so the editor cannot be overlaid for clickjacking.
if (window.top !== window.self) root.textContent = translate('app.framedRefused', getLanguage());
else {
  const tab = await startTab();
  createRoot(root).render(
    <StrictMode>
      <App tab={tab} drafts={new DraftStore(undefined, undefined, draftKey(tab.id))} />
    </StrictMode>,
  );
}
