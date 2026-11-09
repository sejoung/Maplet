import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import { getLanguage } from './i18n/locale';
import { translate } from './i18n/core';
import { clearDriveSession } from './adapters/drive/session';
import { startPageLanguage } from './adapters/page-language';
import { startPageTheme } from './adapters/page-theme';
import { createUsageStats } from './adapters/analytics';
import { storedPreferences } from './adapters/storage/preferences';
import { PreferencesContext } from './components/shared/preferences';
import { DraftStore } from './adapters/storage/drafts';
import { draftKey, startTab } from './adapters/storage/tab-session';

startPageLanguage();
const preferences = storedPreferences();
startPageTheme(preferences);
// Migration: older releases stored Drive credentials; none are ever restored.
clearDriveSession();

const root = document.getElementById('root')!;
// Static hosting cannot send `frame-ancestors`; refuse to run inside another site's frame
// so the editor cannot be overlaid for clickjacking.
if (window.top !== window.self) root.textContent = translate('app.framedRefused', getLanguage());
else {
  const tab = await startTab();
  const usageStats = import.meta.env.PROD
    ? createUsageStats(import.meta.env.VITE_GA_MEASUREMENT_ID ?? '')
    : null;
  createRoot(root).render(
    <StrictMode>
      <PreferencesContext.Provider value={preferences}>
        <App
          tab={tab}
          drafts={new DraftStore(undefined, undefined, draftKey(tab.id))}
          usageStats={usageStats}
        />
      </PreferencesContext.Provider>
    </StrictMode>,
  );
}
